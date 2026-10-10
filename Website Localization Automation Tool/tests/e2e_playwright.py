"""End-to-end test using Playwright (chromium) against the real running app.

Flow: frontend create project -> crawl -> page editor (translate+approve) ->
publish -> open sample site -> select Spanish -> verify localized content.

Backend (8000) and frontend (5174 via Vite proxy) must be running.
Playwright chromium must be installed.
"""
import sys, time, re
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

FRONTEND = "http://127.0.0.1:5175"  # Use 5175 if 5174 is in use
BACKEND = "http://127.0.0.1:8000"


def wait_for(cond, timeout=60, interval=0.5):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if cond():
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        page.on("pageerror", lambda e: print("PAGEERROR:", e.message))
        page.on("response", lambda r: print("RESP", r.status, r.url) if r.status >= 400 else None)

        # 1) Create project
        page.goto(FRONTEND + "/create", wait_until="networkidle")
        page.fill('input[placeholder="https://example.com"]', "http://127.0.0.1:8000/sample-site/index.html")
        page.locator("input").first.fill("Acme E2E")
        # Wait for form state to update
        page.wait_for_timeout(1000)
        # Debug: check form values and validation state
        url_val = page.evaluate("() => document.querySelector('input[placeholder=\"https://example.com\"]').value")
        name_val = page.evaluate("() => document.querySelector('input').value")
        print("URL value:", url_val)
        print("Name value:", name_val)
        # Check validation state by evaluating the validation function
        validation = page.evaluate("""() => {
            const url = document.querySelector('input[placeholder="https://example.com"]').value;
            try {
                const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
                return {
                    protocol: parsed.protocol,
                    hostname: parsed.hostname,
                    valid: parsed.protocol === "http:" || parsed.protocol === "https:",
                    hostname_valid: !!parsed.hostname
                };
            } catch (e) {
                return { error: e.message };
            }
        }""")
        print("URL validation:", validation)
        # Check button disabled state and attributes
        btn_state = page.evaluate("""() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.innerText.includes('Next')) {
                    return {
                        disabled: btn.disabled,
                        type: btn.type,
                        className: btn.className,
                        innerText: btn.innerText
                    };
                }
            }
            return { error: 'Next button not found' };
        }""")
        print("Button state:", btn_state)
        # Check for validation error messages
        error_msgs = page.locator("text=/error|Error|invalid|Invalid|must|Must/i").all_text_contents()
        print("Error messages on page:", error_msgs)
        # Wait for Next button to be enabled
        wait_for(lambda: page.get_by_role("button", name="Next").is_enabled(), timeout=10)
        # Click Next to go to step 2 (Source Language)
        page.get_by_role("button", name="Next").click()
        # Wait for step 2 to load and auto-detect language, then click Next to step 3
        wait_for(lambda: page.get_by_role("button", name="Next").is_enabled(), timeout=15)
        page.get_by_role("button", name="Next").click()
        # Select target language
        page.select_option("select", "es")
        # Click Next to go to step 4 (Summary)
        wait_for(lambda: page.get_by_role("button", name="Next").is_enabled(), timeout=5)
        page.get_by_role("button", name="Next").click()
        # Click Create & Scan (use getByRole to handle HTML-encoded ampersand)
        wait_for(lambda: page.get_by_role("button", name="Create & Scan").is_enabled(), timeout=5)
        print("Create & Scan button found and enabled")
        page.get_by_role("button", name="Create & Scan").click()
        print("Create & Scan button clicked")
        # Debug: check form state at step 4
        page.wait_for_timeout(2000)
        form_state = page.evaluate("""() => {
            const inputs = document.querySelectorAll('input, select');
            const state = {};
            inputs.forEach(input => {
                state[input.name || input.id] = input.value;
            });
            return state;
        }""")
        print("Form state:", form_state)
        # Debug: check current step and pathname
        wait_for(lambda: page.evaluate("window.location.pathname") != "/create", timeout=10)
        pathname = page.evaluate("window.location.pathname")
        print("pathname after create:", pathname)
        
        # Debug: check for error messages
        error_text = page.locator("text=/error|Error|failed|Failed/i").first.text_content()
        if error_text:
            print("Error message:", error_text)
        # Wait for the client-side navigation to a project route. The crawl step
        # briefly shows /project/:id/crawl then auto-redirects to /pages; use
        # window.location.pathname (reliable) rather than page.url (which can lag).
        wait_for(lambda: "/project/" in page.evaluate("window.location.pathname"), timeout=30)
        pathname = page.evaluate("window.location.pathname")
        print("pathname:", pathname)
        pid = re.search(r"/project/([^/]+)", pathname).group(1)
        print("project id:", pid)

        # 2) Wait for crawl to complete (the crawl page auto-redirects to /pages)
        wait_for(lambda: "/pages" in page.evaluate("window.location.pathname"), timeout=90)
        print("navigated to pages:", page.evaluate("window.location.pathname"))

        # 3) Wait for table rows
        wait_for(lambda: page.locator("table tbody tr").count() >= 4, timeout=20)
        rows = page.locator("table tbody tr")
        print("rows:", rows.count())

        # 3a) Select pages for translation first -- publish requires
        #     Page.selected_for_translation == True, otherwise it 422s.
        #     Target the index.html row specifically (the sample-site
        #     assertion below checks index.html is localized) and use its
        #     body checkbox (the header checkbox is readOnly).
        wait_for(lambda: page.locator("tr:has-text('index.html')").count() == 1, timeout=20)
        idx_row = page.locator("tr:has-text('index.html')").first
        if not idx_row.locator("input[type='checkbox']").is_checked():
            idx_row.locator("input[type='checkbox']").check(timeout=5000)
        wait_for(lambda: page.is_enabled("button:has-text('Translate Selected')"), timeout=10)
        page.click("button:has-text('Translate Selected')")
        # startTranslation marks the pages selected and reloads the table
        wait_for(lambda: page.locator("table tbody tr").count() >= 4, timeout=20)
        print("selected pages for translation")

        # 3b) Open the index.html page's editor (target by row text so it is
        #     correct regardless of table sort order).
        page.locator("tr:has-text('index.html')").locator("button:has-text('Edit')").click()
        wait_for(lambda: "/edit/" in page.evaluate("window.location.pathname"), timeout=20)

        # 4) Translate all + approve all
        wait_for(lambda: page.is_visible("button:has-text('Translate All')"), timeout=15)
        page.click("button:has-text('Translate All')")
        wait_for(lambda: page.locator("button:has-text('Approve')").count() >= 3, timeout=90)
        approves = page.locator("button:has-text('Approve')")
        for i in range(approves.count()):
            approves.nth(i).click()
            page.wait_for_timeout(200)
        page.wait_for_timeout(800)
        print("approved all segments")

        # 5) Publish
        page.goto(FRONTEND + f"/project/{pid}/publish", wait_until="networkidle")
        wait_for(lambda: page.is_visible("button:has-text('Publish Now')"), timeout=15)
        page.click("button:has-text('Publish Now')")
        wait_for(lambda: "Published v" in page.content(), timeout=60)
        snippet_val = page.input_value("textarea[readonly]")
        project_id = re.search(r'data-project="([^"]+)"', snippet_val).group(1)
        print("snippet project id:", project_id)

        # 6) Open sample site (served by backend, same origin for loc.js/runtime)
        sample = browser.new_context().new_page()
        sample.goto(BACKEND + "/sample-site/index.html", wait_until="networkidle")
        sample.wait_for_timeout(1500)
        title_en = sample.title()
        before_h1 = sample.locator("h1").first.inner_text()
        print("before -> title:", title_en, "| h1:", before_h1)

        # 7) Select Spanish via the injected selector
        sel = sample.locator("#loc-lang-selector select")
        wait_for(lambda: sel.count() == 1, timeout=15)
        # find the target-language option (the non-source one)
        opts = sel.locator("option")
        target_idx = 1  # second option = target language
        sel.select_option(index=target_idx)
        sample.wait_for_timeout(2000)
        title_es = sample.title()
        after_h1 = sample.locator("h1").first.inner_text()
        print("after  -> title:", title_es, "| h1:", after_h1)

        assert title_en != title_es or "Inicio" in title_es, "Title did not change after selecting Spanish"
        assert after_h1 != before_h1, "H1 did not change after selecting Spanish"
        print("\nE2E PASS: content localized on the live site")
        print("title:", title_en, "->", title_es)
        print("h1:", before_h1, "->", after_h1)
        browser.close()
        return True


if __name__ == "__main__":
    try:
        ok = main()
        print("\nRESULT: PASS")
    except AssertionError as e:
        print("\nRESULT: FAIL (assertion):", e)
        ok = False
    except Exception as e:
        print("\nRESULT: FAIL (error):", repr(e))
        ok = False
    sys.exit(0 if ok else 1)
