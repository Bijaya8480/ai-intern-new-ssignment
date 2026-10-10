import sys, os
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import httpx

BASE = "http://127.0.0.1:8000"
c = httpx.Client(base_url=BASE, timeout=60)

# Create project targeting Spanish (the test scenario)
resp = c.post("/api/projects", json={
    "name": "Probe",
    "source_url": "http://127.0.0.1:8000/sample-site/index.html",
    "target_language": "es",
    "target_language_name": "Spanish",
    "source_language": "en",
    "source_language_name": "English",
})
pid = resp.json()["id"]
print("project:", pid)

# Start crawl
job = c.post(f"/api/projects/{pid}/crawl").json()
job_id = job["job_id"]
import time
for _ in range(60):
    s = c.get(f"/api/projects/{pid}/crawl/status?job_id={job_id}").json()
    if s["status"] in ("completed", "failed"):
        print("crawl:", s["status"], "crawled=", s["pages_crawled"], "failed=", s["pages_failed"])
        break
    time.sleep(0.5)

pages = c.get(f"/api/projects/{pid}/pages").json()
index = [p for p in pages if "index.html" in p["normalized_url"]]
if not index:
    print("no index page found")
    sys.exit(1)
page_id = index[0]["id"]
print("page:", page_id)

# Extract segments
segs = c.post(f"/api/pages/{page_id}/extract").json()
print("segments:", len(segs))
for s in segs:
    print(f"  [{s['id']}] type={s['element_type']} text={s['source_text'][:60]!r}")

# Translate
print("\n--- translate ---")
results = c.post(f"/api/pages/{page_id}/translate").json()
fail = 0
for r in results:
    ok = r["source"] in ("google-cloud", "google", "mymemory", "ai")
    mark = "OK " if ok else "FAIL"
    if not ok:
        fail += 1
    print(f"  {mark} seg={r['segment_id'][:8]} src={r['source']:10} status={r['translation_status']:20} text={r['target_text'][:60]!r}")
print(f"\nTotal segments: {len(results)}, FAILED: {fail}")
