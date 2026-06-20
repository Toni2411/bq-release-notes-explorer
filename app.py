import os
import time
import requests
import feedparser
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION = 300  # 5 minutes in seconds

def parse_entry_content(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    updates = []
    current_type = None
    current_elements = []
    
    for element in soup.contents:
        # Check if it's a tag (not navstring or comment)
        if element.name == 'h3':
            if current_type is not None or len(current_elements) > 0:
                html_str = ''.join(str(el) for el in current_elements)
                soup_sub = BeautifulSoup(html_str, 'html.parser')
                # Add target="_blank" to all links and style them
                for a in soup_sub.find_all('a'):
                    a['target'] = '_blank'
                    a['rel'] = 'noopener noreferrer'
                
                updates.append({
                    'type': current_type or 'Update',
                    'content_html': str(soup_sub),
                    'content_text': soup_sub.get_text().strip()
                })
            current_type = element.get_text().strip()
            current_elements = []
        else:
            current_elements.append(element)
            
    if current_type is not None or len(current_elements) > 0:
        html_str = ''.join(str(el) for el in current_elements)
        soup_sub = BeautifulSoup(html_str, 'html.parser')
        for a in soup_sub.find_all('a'):
            a['target'] = '_blank'
            a['rel'] = 'noopener noreferrer'
            
        updates.append({
            'type': current_type or 'Update',
            'content_html': str(soup_sub),
            'content_text': soup_sub.get_text().strip()
        })
        
    return updates

def fetch_and_parse_feed(force=False):
    global cache
    now = time.time()
    
    if not force and cache["data"] and (now - cache["last_fetched"] < CACHE_DURATION):
        return cache["data"], False
        
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(FEED_URL, headers=headers, timeout=15)
        response.raise_for_status()
        
        feed = feedparser.parse(response.content)
        
        all_updates = []
        for entry_idx, entry in enumerate(feed.entries):
            entry_title = entry.title
            entry_link = entry.link
            entry_updated = entry.updated if 'updated' in entry else ""
            
            content_html = entry.content[0].value if 'content' in entry else entry.summary
            parsed_updates = parse_entry_content(content_html)
            
            for idx, update in enumerate(parsed_updates):
                update_id = f"{entry_idx}_{idx}"
                all_updates.append({
                    "id": update_id,
                    "date": entry_title,
                    "updated_iso": entry_updated,
                    "type": update["type"],
                    "content_html": update["content_html"],
                    "content_text": update["content_text"],
                    "link": entry_link
                })
                
        cache["data"] = all_updates
        cache["last_fetched"] = now
        return all_updates, True
    except Exception as e:
        print(f"Error fetching feed: {e}")
        if cache["data"]:
            return cache["data"], False
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    try:
        data, fresh = fetch_and_parse_feed()
        return jsonify({
            "status": "success",
            "fresh": fresh,
            "last_fetched": cache["last_fetched"],
            "data": data
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/release-notes/refresh')
def refresh_release_notes():
    try:
        data, fresh = fetch_and_parse_feed(force=True)
        return jsonify({
            "status": "success",
            "fresh": fresh,
            "last_fetched": cache["last_fetched"],
            "data": data
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
