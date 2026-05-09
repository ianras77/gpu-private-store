# server.py
from flask import Flask, request, jsonify
import os
import requests

app = Flask(__name__)

OLLAMA_URL = os.environ.get('OLLAMA_URL') or 'http://ollama:8080'

@app.route('/query', methods=['POST'])
def query_ollama():
    data = request.json
    prompt = data['prompt']
    response = requests.post(OLLAMA_URL, json={'prompt': prompt})
    return jsonify({'response': response.text})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
