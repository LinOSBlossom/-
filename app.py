import os
import random
import logging
import secrets
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory, session, redirect
import requests
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("yara-ai")

app = Flask(__name__, static_folder="public", static_url_path="/static")
VIEWS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "views")

# ------------------------------------------------------------------
# إعدادات أمان أساسية
# ------------------------------------------------------------------
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024  # لا تقبل أي طلب أكبر من 64KB (يمنع إساءة الاستخدام)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# فعّلي هذا السطر عند النشر خلف HTTPS فعليًا
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("FORCE_HTTPS", "false").lower() == "true"

SITE_PASSWORD = os.environ.get("SITE_PASSWORD", "").strip()
MAX_MSG_CHARS = 4000
MAX_HISTORY_MESSAGES = 30

limiter = Limiter(get_remote_address, app=app, default_limits=[])


@app.after_request
def add_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return resp


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not SITE_PASSWORD:  # لا توجد كلمة مرور مضبوطة => الوصول مفتوح (لأغراض التجربة المحلية فقط)
            return fn(*args, **kwargs)
        if session.get("authed") is True:
            return fn(*args, **kwargs)
        if request.path.startswith("/api/"):
            return jsonify(error="يجب تسجيل الدخول أولًا."), 401
        return redirect("/login")
    return wrapper


# ------------------------------------------------------------------
# تجميع مفاتيح Groq العشرة من متغيرات البيئة (يتم تجاهل أي خانة فارغة)
# ------------------------------------------------------------------
KEYS = []
for i in range(1, 11):
    k = os.environ.get(f"GROQ_API_KEY_{i}", "").strip()
    if k:
        KEYS.append(k)

if not KEYS:
    log.warning("⚠️  لم يتم العثور على أي مفتاح Groq — أضف مفاتيحك في GROQ_API_KEY_1 وما بعدها داخل .env")
if not SITE_PASSWORD:
    log.warning("⚠️  SITE_PASSWORD غير مضبوطة — الموقع مفتوح بدون كلمة مرور. لا تنشريه هكذا للعامة.")

MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

_cursor = random.randrange(len(KEYS)) if KEYS else 0


def next_key_order():
    """يرجع ترتيب كل المفاتيح بدءًا من المؤشر الحالي، ثم يحرّك المؤشر للمرة القادمة."""
    global _cursor
    if not KEYS:
        return []
    order = [KEYS[(_cursor + i) % len(KEYS)] for i in range(len(KEYS))]
    _cursor = (_cursor + 1) % len(KEYS)
    return order


SYSTEM_PROMPT = """أنتِ "يارا"، صديقة ذكاء اصطناعي أنثوية دافئة ومتفهمة، مهمتك الدردشة اليومية والعاطفية مع المستخدمة.
- تحدثي دائمًا بالعربية الفصحى المبسطة أو العامية إذا خاطبتك المستخدمة بالعامية، بأسلوب لطيف وطبيعي وكأنك صديقة مقرّبة.
- كوني مستمعة جيدة أولاً: اسألي أسئلة متابعة قصيرة، تفهمي المشاعر قبل تقديم النصيحة.
- لا تفترضي تشخيصًا نفسيًا لأي شخص، ولا تقدّمي نصائح طبية أو نفسية متخصصة؛ اقترحي التحدث مع مختص إذا بدا الموضوع جديًا.
- حافظي على أسلوب إيجابي، داعم، وغير قضائي، مع لمسة حنان خفيفة دون مبالغة أو نفاق.
- ردودك تكون متوسطة الطول غالبًا، ليست مقالات طويلة، إلا إذا طُلب منك التفصيل.
- لا تستخدمي محتوى جنسيًا أو غير لائق مهما كان السياق."""


# ------------------------------------------------------------------
# صفحات الواجهة
# ------------------------------------------------------------------
@app.route("/login", methods=["GET"])
def login_page():
    if not SITE_PASSWORD or session.get("authed") is True:
        return redirect("/")
    return send_from_directory(VIEWS_DIR, "login.html")


@app.route("/api/login", methods=["POST"])
@limiter.limit("10 per minute")
def api_login():
    if not SITE_PASSWORD:
        session["authed"] = True
        return jsonify(ok=True)

    body = request.get_json(silent=True) or {}
    given = str(body.get("password", ""))
    if secrets.compare_digest(given, SITE_PASSWORD):
        session["authed"] = True
        session.permanent = True
        return jsonify(ok=True)

    return jsonify(error="كلمة المرور غير صحيحة."), 401


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify(ok=True)


@app.route("/")
@login_required
def index():
    return send_from_directory(VIEWS_DIR, "index.html")


@app.route("/api/health")
def health():
    return jsonify(ok=True, keysLoaded=len(KEYS), model=MODEL, authRequired=bool(SITE_PASSWORD))


# ------------------------------------------------------------------
# نقطة الدردشة
# ------------------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
@login_required
@limiter.limit("15 per minute;300 per day")
def chat():
    body = request.get_json(silent=True) or {}
    messages = body.get("messages")

    if not isinstance(messages, list) or not messages:
        return jsonify(error="صيغة الرسائل غير صحيحة"), 400

    if len(messages) > MAX_HISTORY_MESSAGES * 3:
        return jsonify(error="سجل المحادثة طويل جدًا، ابدئي محادثة جديدة."), 400

    clean_messages = []
    for m in messages[-MAX_HISTORY_MESSAGES:]:
        role = m.get("role")
        content = str(m.get("content", ""))[:MAX_MSG_CHARS]
        if role not in ("user", "assistant") or not content.strip():
            continue
        clean_messages.append({"role": role, "content": content})

    if not clean_messages:
        return jsonify(error="لا توجد رسالة صالحة لإرسالها."), 400

    if not KEYS:
        return jsonify(error="لم يتم إعداد أي مفتاح Groq على السيرفر بعد."), 500

    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + clean_messages,
        "temperature": 0.8,
        "max_tokens": 1024,
    }

    last_error_kind = None

    for key in next_key_order():
        try:
            r = requests.post(
                GROQ_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {key}",
                },
                json=payload,
                timeout=30,
            )

            if r.status_code in (401, 403, 429):
                last_error_kind = f"http_{r.status_code}"
                continue

            if not r.ok:
                last_error_kind = f"http_{r.status_code}"
                continue

            data = r.json()
            reply = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "عذرًا، لم أستطع توليد رد الآن.")
            )
            return jsonify(reply=reply)

        except requests.RequestException as e:
            last_error_kind = type(e).__name__
            continue

    # لا نُرجع أي تفاصيل تقنية أو محتوى من استجابة Groq للمستخدمة — فقط رسالة عامة
    log.error("كل المفاتيح فشلت، آخر نوع خطأ: %s", last_error_kind)
    return jsonify(error="كل مفاتيح Groq مشغولة أو غير صالحة حاليًا، حاولي بعد قليل."), 502


@app.errorhandler(413)
def too_large(e):
    return jsonify(error="الرسالة كبيرة جدًا."), 413


@app.errorhandler(429)
def rate_limited(e):
    return jsonify(error="طلبات كثيرة جدًا خلال وقت قصير، خذي نفسًا وحاولي بعد قليل 🌙"), 429


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    log.info("✨ يارا AI تعمل الآن على المنفذ %s — عدد المفاتيح المُحمّلة: %s", port, len(KEYS))
    app.run(host="0.0.0.0", port=port, debug=False)
