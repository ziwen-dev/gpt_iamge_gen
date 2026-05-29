import os

import app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    host = (os.environ.get("HOST") or "0.0.0.0").strip()
    app.app.run(host=host, port=port, debug=False, use_reloader=False)
