import sqlite3
import os
import json
import time
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
import paramiko
from threading import Thread
import schedule
import random

def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect('/app/data/monitor.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化数据库表结构"""
    # 🗃️ 这是您负责的数据库创建部分
    conn = get_db()
    cursor = conn.cursor()

    # hosts表 - 存储监控的主机信息
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hosts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            port INTEGER DEFAULT 22,
            name TEXT,
            host_type TEXT DEFAULT 'real',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # metrics表 - 存储监控指标数据
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_id INTEGER NOT NULL,
            cpu FLOAT NOT NULL,
            memory FLOAT NOT NULL,
            disk FLOAT NOT NULL,
            load FLOAT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (host_id) REFERENCES hosts (id)
        )
    ''')

    conn.commit()
    conn.close()
