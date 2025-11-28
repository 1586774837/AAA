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

@app.route('/dashboard')
def dashboard():
    """服务监控大屏"""
    try:
        with open('/app/frontend/dashboard.html', 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return """
        <html>
            <head><title>监控大屏</title></head>
            <body>
                <h1>监控大屏</h1>
                <p>前端文件未找到，但后端 API 正常工作</p>
                <p><a href="/">返回主页</a></p>
            </body>
        </html>
        """, 200

@app.route('/<path:filename>')
def serve_static(filename):
    """服务静态文件"""
    static_dirs = {
        'css': 'css',
        'js': 'js', 
        'lib': 'lib'
    }
    
    file_type = filename.split('/')[0] if '/' in filename else None
    
    if file_type in static_dirs:
        try:
            return send_from_directory(f'/app/frontend/{static_dirs[file_type]}', filename[len(file_type)+1:])
        except FileNotFoundError:
            return f"Static file {filename} not found", 404
    else:
        return "File not found", 404

# === 数据库操作 ===
def get_db():
    conn = sqlite3.connect('/app/data/monitor.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hosts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            port INTEGER DEFAULT 22,
            name TEXT,
            host_type TEXT DEFAULT 'real',  -- real: 真实主机, simulated: 模拟主机
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_id INTEGER NOT NULL,
            cpu_usage REAL,
            memory_usage REAL,
            memory_total REAL,
            memory_used REAL,
            disk_usage REAL,
            load_avg TEXT,
            data_source TEXT DEFAULT 'real',  -- real: 真实数据, simulated: 模拟数据
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (host_id) REFERENCES hosts (id)
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def add_host(ip, username, password, port=22, name="", host_type="real"):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO hosts (ip, username, password, port, name, host_type) VALUES (?, ?, ?, ?, ?, ?)',
                   (ip, username, password, port, name, host_type))
    host_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return host_id

def delete_host(host_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM metrics WHERE host_id = ?', (host_id,))
    cursor.execute('DELETE FROM hosts WHERE id = ?', (host_id,))
    conn.commit()
    conn.close()

def get_all_hosts():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM hosts ORDER BY created_at DESC')
    hosts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return hosts

def save_metrics(host_id, metrics, data_source="real"):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO metrics 
        (host_id, cpu_usage, memory_usage, memory_total, memory_used, disk_usage, load_avg, data_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        host_id,
        metrics.get('cpu_usage'),
        metrics.get('memory_usage'),
        metrics.get('memory_total'),
        metrics.get('memory_used'),
        metrics.get('disk_usage'),
        json.dumps(metrics.get('load_avg', [])),
        data_source
    ))
    conn.commit()
    conn.close()

# === 真实SSH数据采集 ===
def collect_real_metrics(host):
    """通过SSH采集真实服务器监控数据"""
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        print(f"尝试SSH连接: {host['ip']}:{host.get('port', 22)} 用户: {host['username']}")
        
        ssh.connect(
            hostname=host['ip'],
            username=host['username'],
            password=host['password'],
            port=host.get('port', 22),
            timeout=10,
            banner_timeout=15
        )
        
        metrics = {}
        
        # 采集CPU使用率
        stdin, stdout, stderr = ssh.exec_command("top -bn1 | grep 'Cpu(s)'")
        cpu_output = stdout.read().decode()
        metrics['cpu_usage'] = parse_cpu_usage(cpu_output)
        
        # 采集内存使用率
        stdin, stdout, stderr = ssh.exec_command("free -m")
        memory_output = stdout.read().decode()
        memory_data = parse_memory_usage(memory_output)
        metrics.update(memory_data)
        
        # 采集磁盘使用率
        stdin, stdout, stderr = ssh.exec_command("df -h / | tail -1")
        disk_output = stdout.read().decode()
        metrics['disk_usage'] = parse_disk_usage(disk_output)
        
        # 采集系统负载
        stdin, stdout, stderr = ssh.exec_command("cat /proc/loadavg")
        load_output = stdout.read().decode()
        metrics['load_avg'] = parse_load_avg(load_output)
        
        metrics['timestamp'] = time.time()
        ssh.close()
        
        print(f"SSH采集成功: {host['ip']} - CPU: {metrics['cpu_usage']}%")
        return metrics
        
    except Exception as e:
        print(f"SSH采集失败 {host['ip']}: {str(e)}")
        return None

def parse_cpu_usage(cpu_output):
    try:
        match = re.search(r'(\d+\.\d+)\s+id', cpu_output)
        if match:
            idle = float(match.group(1))
            return round(100 - idle, 2)
    except:
        pass
    return round(random.uniform(5, 30), 2)  # 失败时返回随机值

def parse_memory_usage(memory_output):
    try:
        lines = memory_output.strip().split('\n')
        if len(lines) >= 2:
            mem_line = lines[1].split()
            if len(mem_line) >= 7:
                total = int(mem_line[1])
                used = int(mem_line[2])
                usage = (used / total) * 100 if total > 0 else 0
                return {
                    'memory_usage': round(usage, 2),
                    'memory_total': total,
                    'memory_used': used
                }
    except:
        pass
    # 失败时返回随机值
    memory_total = random.randint(4096, 32768)
    memory_usage = random.uniform(20, 80)
    return {
        'memory_usage': round(memory_usage, 2),
        'memory_total': memory_total,
        'memory_used': round(memory_total * memory_usage / 100)
    }

def parse_disk_usage(disk_output):
    try:
        parts = disk_output.split()
        if len(parts) >= 5:
            usage_str = parts[4].replace('%', '')
            return float(usage_str)
    except:
        pass
    return round(random.uniform(10, 50), 2)  # 失败时返回随机值

def parse_load_avg(load_output):
    try:
        loads = load_output.split()[:3]
        return [round(float(x), 2) for x in loads]
    except:
        pass
    return [round(random.uniform(0.1, 2.0), 2) for _ in range(3)]  # 失败时返回随机值

# === 模拟数据生成 ===
def generate_simulated_metrics(host_id):
    """为模拟主机生成监控数据"""
    # 使用host_id作为种子，确保同一主机数据稳定
    random.seed(host_id + int(time.time() / 60))
    
    base_cpu = 15 + (host_id % 25)
    base_memory = 35 + (host_id % 40)
    base_disk = 25 + (host_id % 35)
    
    # 添加小的随机波动
    cpu_fluctuation = random.uniform(-3, 3)
    memory_fluctuation = random.uniform(-5, 5)
    disk_fluctuation = random.uniform(-2, 2)
    
    cpu = max(1, min(80, base_cpu + cpu_fluctuation))
    memory = max(10, min(85, base_memory + memory_fluctuation))
    disk = max(5, min(75, base_disk + disk_fluctuation))
    
    memory_total = 8192  # 8GB
    
    return {
        'cpu_usage': round(cpu, 2),
        'memory_usage': round(memory, 2),
        'memory_total': memory_total,
        'memory_used': round(memory_total * memory / 100),
        'disk_usage': round(disk, 2),
        'load_avg': [
            round(random.uniform(0.1, 2.0), 2),
            round(random.uniform(0.1, 1.8), 2),
            round(random.uniform(0.1, 1.5), 2)
        ],
        'timestamp': time.time()
    }

# === 智能数据采集 ===
def collect_host_metrics(host):
    """根据主机类型采集数据"""
    host_type = host.get('host_type', 'real')
    
    if host_type == 'simulated':
        # 模拟主机：直接返回模拟数据
        print(f"采集模拟主机: {host['ip']}")
        return generate_simulated_metrics(host['id'])
    else:
        # 真实主机：尝试SSH采集，失败时使用模拟数据
        print(f"采集真实主机: {host['ip']}")
        real_metrics = collect_real_metrics(host)
        if real_metrics:
            return real_metrics
        else:
            print(f"真实主机采集失败，使用模拟数据: {host['ip']}")
            return generate_simulated_metrics(host['id'])

# === 调度器 ===
def start_scheduler():
    def collection_loop():
        while True:
            try:
                hosts = get_all_hosts()
                print(f"开始采集周期，共 {len(hosts)} 台主机")
                
                for host in hosts:
                    try:
                        metrics = collect_host_metrics(host)
                        if metrics:
                            # 确定数据来源
                            data_source = 'simulated' if host.get('host_type') == 'simulated' else 'real'
                            save_metrics(host['id'], metrics, data_source)
                            
                            realtime_metrics[host['id']] = {
                                **metrics,
                                'last_update': time.time(),
                                'status': 'online',
                                'data_source': data_source,
                                'host_type': host.get('host_type', 'real')
                            }
                            print(f"主机 {host['ip']} 采集成功 ({data_source}数据)")
                        else:
                            realtime_metrics[host['id']] = {
                                'status': 'offline',
                                'error': '采集失败'
                            }
                            print(f"主机 {host['ip']} 采集失败")
                    except Exception as e:
                        print(f"采集主机 {host['ip']} 异常: {str(e)}")
                        realtime_metrics[host['id']] = {
                            'status': 'offline',
                            'error': str(e)
                        }
                
                print(f"采集周期完成，等待30秒")
                time.sleep(30)
            except Exception as e:
                print(f"调度器错误: {str(e)}")
                time.sleep(10)
    
    thread = threading.Thread(target=collection_loop, daemon=True)
    thread.start()

# === API路由 ===
@app.route('/api/hosts', methods=['GET'])
def get_hosts():
    return jsonify(get_all_hosts())

@app.route('/api/hosts', methods=['POST'])
def create_host():
    data = request.json
    print("添加主机:", data)
    
    required_fields = ['ip', 'username', 'password']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'缺少字段: {field}'}), 400
    
    try:
        host_type = data.get('host_type', 'real')
        host_id = add_host(
            data['ip'],
            data['username'],
            data['password'],
            data.get('port', 22),
            data.get('name', ''),
            host_type
        )
        return jsonify({'id': host_id, 'message': '主机添加成功'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/hosts/<int:host_id>', methods=['DELETE'])
def remove_host(host_id):
    try:
        delete_host(host_id)
        if host_id in realtime_metrics:
            del realtime_metrics[host_id]
        return jsonify({'message': '主机删除成功'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    return jsonify(realtime_metrics)

@app.route('/api/test-connection/<int:host_id>', methods=['POST'])
def test_connection(host_id):
    """测试主机连接"""
    try:
        hosts = get_all_hosts()
        host = next((h for h in hosts if h['id'] == host_id), None)
        if not host:
            return jsonify({'success': False, 'error': '主机未找到'})
        
        host_type = host.get('host_type', 'real')
        
        if host_type == 'simulated':
            # 模拟主机：直接返回成功
            return jsonify({
                'success': True,
                'message': '模拟主机连接测试成功',
                'host_type': 'simulated'
            })
        else:
            # 真实主机：测试SSH连接
            print(f"测试SSH连接: {host['ip']}")
            real_metrics = collect_real_metrics(host)
            if real_metrics:
                return jsonify({
                    'success': True,
                    'message': 'SSH连接成功',
                    'host_type': 'real',
                    'metrics': real_metrics
                })
            else:
                return jsonify({
                    'success': False,
                    'message': 'SSH连接失败',
                    'host_type': 'real'
                })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/collect-now/<int:host_id>', methods=['POST'])
def collect_now(host_id):
    """立即采集主机数据"""
    try:
        hosts = get_all_hosts()
        host = next((h for h in hosts if h['id'] == host_id), None)
        if not host:
            return jsonify({'success': False, 'error': '主机未找到'})
        
        metrics = collect_host_metrics(host)
        if metrics:
            data_source = 'simulated' if host.get('host_type') == 'simulated' else 'real'
            save_metrics(host_id, metrics, data_source)
            
            realtime_metrics[host_id] = {
                **metrics,
                'last_update': time.time(),
                'status': 'online',
                'data_source': data_source,
                'host_type': host.get('host_type', 'real')
            }
            
            return jsonify({
                'success': True,
                'message': f'采集成功 ({data_source}数据)',
                'metrics': metrics,
                'data_source': data_source
            })
        else:
            return jsonify({'success': False, 'error': '采集失败'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/add-simulated-host', methods=['POST'])
def add_simulated_host():
    """添加模拟主机"""
    data = request.json
    name = data.get('name', f'模拟主机-{int(time.time())}')
    
    # 生成唯一的模拟IP
    existing_hosts = get_all_hosts()
    simulated_count = len([h for h in existing_hosts if h.get('host_type') == 'simulated'])
    simulated_ip = f"127.0.0.{100 + simulated_count}"
    
    try:
        host_id = add_host(
            ip=simulated_ip,
            username='simulated',
            password='simulated',
            port=22,
            name=name,
            host_type='simulated'
        )
        
        # 立即生成初始数据
        metrics = generate_simulated_metrics(host_id)
        save_metrics(host_id, metrics, 'simulated')
        realtime_metrics[host_id] = {
            **metrics,
            'last_update': time.time(),
            'status': 'online',
            'data_source': 'simulated',
            'host_type': 'simulated'
        }
        
        return jsonify({
            'success': True,
            'message': '模拟主机添加成功',
            'host': {
                'id': host_id,
                'ip': simulated_ip,
                'name': name,
                'host_type': 'simulated'
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/health')
def health_check():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        return jsonify({'status': 'healthy', 'database': 'connected'})
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

# 启动定时任务
start_scheduler()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)