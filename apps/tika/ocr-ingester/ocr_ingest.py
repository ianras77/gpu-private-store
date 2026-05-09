import glob
import os
import time

import psycopg2
import requests

def save_to_db(filename, content):
    conn = psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        host=os.getenv("DB_HOST"),
    )
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ocr_results (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE,
            content TEXT
        );
    """)
    cur.execute(
        """
        INSERT INTO ocr_results (filename, content)
        VALUES (%s, %s)
        ON CONFLICT (filename)
        DO UPDATE SET content = EXCLUDED.content
        """,
        (filename, content),
    )
    conn.commit()
    cur.close()
    conn.close()

def process_file(filename):
    tika_url = os.getenv("TIKA_URL", "http://tika:9998/tika")
    with open(filename, 'rb') as f:
        headers = {'Accept': 'text/plain'}
        resp = requests.put(tika_url, data=f, headers=headers)
        if resp.status_code == 200:
            save_to_db(filename, resp.text)
        else:
            print(f"Error from Tika: {resp.status_code}")

if __name__ == "__main__":
    scan_interval = int(os.getenv("OCR_SCAN_INTERVAL_SECONDS", "30"))
    tracked_mtimes = {}

    while True:
        files = sorted(glob.glob("/app/samples/*"))
        for filename in files:
            try:
                mtime = os.path.getmtime(filename)
            except FileNotFoundError:
                continue

            if tracked_mtimes.get(filename) == mtime:
                continue

            process_file(filename)
            tracked_mtimes[filename] = mtime

        time.sleep(scan_interval)
