// 主机管理功能
const API_BASE = window.location.origin;

class HostManager {
    constructor() {
        this.init();
    }

    init() {
        this.loadHosts();
        this.setupEventListeners();
        this.toggleHostType(); // 初始化显示正确的字段
    }

    setupEventListeners() {
        const form = document.getElementById('addHostForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addHost();
            });
        }
    }

    toggleHostType() {
        const hostType = document.getElementById('hostType').value;
        const realFields = document.getElementById('realHostFields');
        const simulatedFields = document.getElementById('simulatedHostFields');
        
        if (hostType === 'real') {
            realFields.style.display = 'block';
            simulatedFields.style.display = 'none';
        } else {
            realFields.style.display = 'none';
            simulatedFields.style.display = 'block';
        }
    }

    async loadHosts() {
        try {
            const response = await fetch(`${API_BASE}/api/hosts`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const hosts = await response.json();
            this.renderHosts(hosts);
        } catch (error) {
            console.error('加载主机列表失败:', error);
            this.showMessage('加载主机列表失败: ' + error.message, 'error');
        }
    }

    renderHosts(hosts) {
        const container = document.getElementById('hostsList');
        if (!container) return;

        if (hosts.length === 0) {
            container.innerHTML = '<div class="alert alert-info">暂无监控主机，请添加主机开始监控</div>';
            return;
        }

        // 按类型分组
        const realHosts = hosts.filter(h => h.host_type === 'real');
        const simulatedHosts = hosts.filter(h => h.host_type === 'simulated');

        let html = '';

        // 显示真实主机
        if (realHosts.length > 0) {
            html += '<h3>真实服务器</h3>';
            html += realHosts.map(host => this.renderHostCard(host)).join('');
        }

        // 显示模拟主机
        if (simulatedHosts.length > 0) {
            html += '<h3 style="margin-top: 30px;">模拟主机</h3>';
            html += simulatedHosts.map(host => this.renderHostCard(host)).join('');
        }

        container.innerHTML = html;
    }

    renderHostCard(host) {
        const hostType = host.host_type || 'real';
        const typeBadge = hostType === 'simulated' ? 
            '<span class="host-type-badge host-type-simulated">模拟主机</span>' : 
            '<span class="host-type-badge host-type-real">真实服务器</span>';
        
        return `
            <div class="card ${hostType === 'simulated' ? 'simulated-host-panel' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin-top: 0;">${host.name || '未命名主机'} ${typeBadge}</h3>
                        <p><strong>IP:</strong> ${host.ip}:${host.port}</p>
                        <p><strong>用户名:</strong> ${host.username}</p>
                        <p><strong>添加时间:</strong> ${new Date(host.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                        <button class="btn btn-success" onclick="hostManager.testHost(${host.id})">测试连接</button>
                        <button class="btn btn-danger" onclick="hostManager.deleteHost(${host.id})">删除</button>
                    </div>
                </div>
            </div>
        `;
    }

    async addHost() {
        const form = document.getElementById('addHostForm');
        if (!form) return;

        const formData = new FormData(form);
        const hostType = formData.get('hostType');
        
        let data = {
            name: formData.get('name') || '',
            host_type: hostType
        };

        if (hostType === 'real') {
            // 真实主机需要完整的认证信息
            data = {
                ...data,
                ip: formData.get('ip'),
                username: formData.get('username'),
                password: formData.get('password'),
                port: parseInt(formData.get('port')) || 22
            };

            // 基本验证
            if (!data.ip || !data.username || !data.password) {
                this.showMessage('请填写所有必填字段', 'error');
                return;
            }

            // IP 地址验证
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (!ipRegex.test(data.ip)) {
                this.showMessage('请输入有效的 IP 地址', 'error');
                return;
            }
        } else {
            // 模拟主机使用默认值
            data = {
                ...data,
                ip: `127.0.0.${Math.floor(100 + Math.random() * 100)}`,
                username: 'simulated',
                password: 'simulated',
                port: 22
            };
        }

        try {
            const response = await fetch(`${API_BASE}/api/hosts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                this.showMessage('主机添加成功', 'success');
                form.reset();
                this.loadHosts();
            } else {
                this.showMessage('添加失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('添加主机失败:', error);
            this.showMessage('网络错误: ' + error.message, 'error');
        }
    }

    async addSimulatedHost() {
        const name = prompt('请输入模拟主机名称:', `模拟主机-${new Date().toLocaleTimeString()}`);
        if (!name) return;

        try {
            const response = await fetch(`${API_BASE}/api/add-simulated-host`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('模拟主机添加成功', 'success');
                this.loadHosts();
            } else {
                this.showMessage('添加失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('添加模拟主机失败:', error);
            this.showMessage('网络错误: ' + error.message, 'error');
        }
    }

    async addMultipleSimulatedHosts(count) {
        try {
            const response = await fetch(`${API_BASE}/api/add-simulated-hosts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ count })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage(`成功添加 ${count} 台模拟主机`, 'success');
                this.loadHosts();
            } else {
                this.showMessage('添加失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('添加模拟主机失败:', error);
            this.showMessage('网络错误: ' + error.message, 'error');
        }
    }

    async deleteHost(hostId) {
        if (!confirm('确定要删除这个主机吗？相关的监控数据也会被删除。')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/hosts/${hostId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showMessage('主机删除成功', 'success');
                this.loadHosts();
            } else {
                const result = await response.json();
                this.showMessage('删除失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('删除主机失败:', error);
            this.showMessage('删除失败: ' + error.message, 'error');
        }
    }

    async testHost(hostId) {
        try {
            const response = await fetch(`${API_BASE}/api/test-connection/${hostId}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                const hostType = result.host_type || 'real';
                const message = hostType === 'simulated' ? 
                    '模拟主机连接测试成功' : 'SSH连接测试成功';
                this.showMessage(message, 'success');
            } else {
                this.showMessage('连接测试失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('测试连接失败:', error);
            this.showMessage('测试连接失败: ' + error.message, 'error');
        }
    }

    showMessage(message, type) {
        // 创建消息元素
        const messageDiv = document.createElement('div');
        messageDiv.className = `alert alert-${type}`;
        messageDiv.textContent = message;
        
        // 添加到页面顶部
        const container = document.querySelector('.container');
        container.insertBefore(messageDiv, container.firstChild);
        
        // 3秒后自动移除
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }
}

// 初始化主机管理器
const hostManager = new HostManager();