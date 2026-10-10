import time
from playwright.sync_api import sync_playwright

FRONTEND = "http://127.0.0.1:5174"

def wait_for(cond, timeout=60, interval=0.5):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if cond():
                return True
        except Exception as e:
            print("cond err", e)
        time.sleep(interval)
    return False

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_page()
    page.on("pageerror", lambda e: print("PAGEERROR:", e.message))
    page.goto(FRONTEND + "/projects", wait_until="networkidle")
    page.fill('input[placeholder="https://example.com"]', "http://127.0.0.1:8000/sample-site/index.html")
    page.locator("input").first.fill("Acme E2E")
    page.select_option("select", "es")
    print("clicking create...")
    page.click("button:has-text('Create Project')")
    # poll page.url AND pathname
    for i in range(40):
        time.sleep(0.5)
        pu = page.url
        try:
            pn = page.evaluate("window.location.pathname")
        except Exception as pn_e:
            pn = f"ERR {pn_e}"
        flag = "  <-- /crawl" if "/crawl" in pu else ""
        print(f"i={i} page.url={pu} pathname={pn}{flag}")
        if "/pages" in pn:
            print("GOT /pages via pathname")
            break
    browser.close()
