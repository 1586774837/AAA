from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import paramiko
import re
import time
import threading
import json
import os
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'

# 存储实时监控数据
realtime_metrics = {}

# === 前端服务 ===
@app.route('/')
def index():
    """服务主页"""
    try:
        with open('/app/frontend/index.html', 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return """
        <html>
            <head><title>服务器监控系统</title></head>
            <body>
                <h1>服务器监控系统</h1>
                <p>前端文件未找到，但后端 API 正常工作</p>
                <p><a href="/health">检查健康状态</a></p>
                <p><a href="/api/hosts">查看主机 API</a></p>
            </body>
        </html>
        """, 200