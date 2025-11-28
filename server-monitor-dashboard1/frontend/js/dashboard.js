// 监控大屏功能
const API_BASE = window.location.origin;

class Dashboard {
    constructor() {
        this.hosts = [];
        this.metrics = {};
        this.autoRefreshInterval = null;
        this.init();
    }

    async init() {
        await this.loadHosts();
        this.setupAutoRefresh();
        this.setupEventListeners();
        this.updateDashboard();
    }

    setupEventListeners() {
        // 自动刷新复选框
        const autoRefreshCheckbox = document.getElementById('autoRefresh');
        if (autoRefreshCheckbox) {
            autoRefreshCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        }
    }

    setupAutoRefresh() {
        this.startAutoRefresh();
    }

    startAutoRefresh() {
        this.stopAutoRefresh(); // 清除现有间隔
        this.autoRefreshInterval = setInterval(() => {
            this.updateDashboard();
        }, 5000); // 每5秒刷新一次
        
        // 更新按钮状态
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.textContent = `自动刷新中 (${new Date().toLocaleTimeString()})`;
        }
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
        
        // 更新按钮状态
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.textContent = '立即刷新';
        }
    }

    manualRefresh() {
        this.updateDashboard();
        
        // 临时显示刷新状态
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            const originalText = refreshBtn.textContent;
            refreshBtn.textContent = '刷新中...';
            setTimeout(() => {
                refreshBtn.textContent = originalText;
            }, 1000);
        }
    }

    async loadHosts() {
        try {
            const response = await fetch(`${API_BASE}/api/hosts`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.hosts = await response.json();
            return this.hosts;
        } catch (error) {
            console.error('加载主机列表失败:', error);
            this.showMessage('加载主机列表失败: ' + error.message, 'error');
            return [];
        }
    }

    async loadMetrics() {
        try {
            const response = await fetch(`${API_BASE}/api/metrics`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.metrics = await response.json();
            return this.metrics;
        } catch (error) {
            console.error('加载监控数据失败:', error);
            this.showMessage('加载监控数据失败: ' + error.message, 'error');
            return {};
        }
    }

    async updateDashboard() {
        try {
            // 并行加载主机和监控数据
            const [hosts, metrics] = await Promise.all([
                this.loadHosts(),
                this.loadMetrics()
            ]);

            this.hosts = hosts;
            this.metrics = metrics;

            this.updateStatsOverview();
            this.renderServerCards();
            
        } catch (error) {
            console.error('更新监控大屏失败:', error);
        }
    }

    updateStatsOverview() {
        const totalHosts = this.hosts.length;
        let onlineHosts = 0;
        let offlineHosts = 0;
        let simulatedHosts = 0;

        // 统计主机状态
        this.hosts.forEach(host => {
            const hostMetrics = this.metrics[host.id];
            if (host.host_type === 'simulated') {
                simulatedHosts++;
            } else if (hostMetrics && hostMetrics.status === 'online') {
                onlineHosts++;
            } else {
                offlineHosts++;
            }
        });

        // 更新统计卡片
        document.getElementById('totalHosts').textContent = totalHosts;
        document.getElementById('onlineHosts').textContent = onlineHosts;
        document.getElementById('offlineHosts').textContent = offlineHosts;
        document.getElementById('simulatedHosts').textContent = simulatedHosts;

        // 显示/隐藏无主机消息
        const noHostsMessage = document.getElementById('noHostsMessage');
        if (noHostsMessage) {
            noHostsMessage.style.display = totalHosts === 0 ? 'block' : 'none';
        }
    }

    renderServerCards() {
        const container = document.getElementById('monitorContent');
        if (!container) return;

        if (this.hosts.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '';

        this.hosts.forEach(host => {
            const metrics = this.metrics[host.id];
            html += this.renderServerCard(host, metrics);
        });

        container.innerHTML = html;
    }

    renderServerCard(host, metrics) {
        const hostType = host.host_type || 'real';
        const isSimulated = hostType === 'simulated';
        const isOnline = metrics && metrics.status === 'online';
        const dataSource = metrics ? (metrics.data_source || 'real') : 'unknown';
        
        // 基础卡片类
        let cardClass = 'server-card';
        if (isSimulated) cardClass += ' simulated';
        if (!isOnline) cardClass += ' offline';

        // 状态徽章
        const statusText = isOnline ? '在线' : '离线';
        const statusClass = isOnline ? 'status-online' : 'status-offline';

        // 数据来源徽章
        let dataSourceBadge = '';
        if (isOnline) {
            if (dataSource === 'real' || hostType === 'real') {
                dataSourceBadge = '<span class="data-source-badge data-source-real">✅ 真实数据</span>';
            } else {
                dataSourceBadge = '<span class="data-source-badge data-source-simulated">🔹 模拟数据</span>';
            }
        }

        // 最后更新时间
        let lastUpdate = '';
        if (metrics && metrics.last_update) {
            const updateTime = new Date(metrics.last_update * 1000);
            lastUpdate = `<div class="last-update">最后更新: ${updateTime.toLocaleTimeString()}</div>`;
        }

        return `
            <div class="${cardClass}" id="server-${host.id}">
                ${dataSourceBadge}
                
                <div class="server-header">
                    <div>
                        <h3 class="server-title">${host.name || '未命名主机'}</h3>
                        <p>${host.ip}:${host.port} (${host.username})</p>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>

                ${isOnline ? this.renderOnlineMetrics(host, metrics) : this.renderOfflineState(host, metrics)}
                
                ${lastUpdate}
            </div>
        `;
    }

    renderOnlineMetrics(host, metrics) {
        if (!metrics) return '';

        const cpuUsage = metrics.cpu_usage || 0;
        const memoryUsage = metrics.memory_usage || 0;
        const diskUsage = metrics.disk_usage || 0;
        const loadAvg = metrics.load_avg || [0, 0, 0];
        const memoryUsed = metrics.memory_used || 0;
        const memoryTotal = metrics.memory_total || 0;

        // CPU 进度条颜色
        const cpuBarClass = cpuUsage > 80 ? 'danger' : cpuUsage > 60 ? 'warning' : '';

        // 内存进度条颜色
        const memoryBarClass = memoryUsage > 90 ? 'danger' : memoryUsage > 80 ? 'warning' : '';

        // 磁盘进度条颜色
        const diskBarClass = diskUsage > 90 ? 'danger' : diskUsage > 80 ? 'warning' : '';

        return `
            <div class="metrics-container">
                <!-- CPU 使用率 -->
                <div class="metric">
                    <div class="metric-label">
                        <span>CPU 使用率</span>
                        <span class="metric-value">${cpuUsage.toFixed(1)}%</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${cpuBarClass}" style="width: ${Math.min(cpuUsage, 100)}%">
                            <span class="progress-value">${cpuUsage.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>

                <!-- 内存使用率 -->
                <div class="metric">
                    <div class="metric-label">
                        <span>内存使用率</span>
                        <span class="metric-value">${memoryUsage.toFixed(1)}%</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${memoryBarClass}" style="width: ${Math.min(memoryUsage, 100)}%">
                            <span class="progress-value">${memoryUsage.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div style="font-size: 0.9em; color: #7f8c8d; margin-top: 5px;">
                        ${Math.round(memoryUsed)} / ${Math.round(memoryTotal)} MB
                    </div>
                </div>

                <!-- 磁盘使用率 -->
                <div class="metric">
                    <div class="metric-label">
                        <span>磁盘使用率</span>
                        <span class="metric-value">${diskUsage.toFixed(1)}%</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${diskBarClass}" style="width: ${Math.min(diskUsage, 100)}%">
                            <span class="progress-value">${diskUsage.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>

                <!-- 系统负载 -->
                <div class="metric">
                    <div class="metric-label">
                        <span>系统负载</span>
                    </div>
                    <div class="load-avg">
                        <div class="load-item">
                            <div class="load-value">${loadAvg[0]?.toFixed(2) || '0.00'}</div>
                            <div>1分钟</div>
                        </div>
                        <div class="load-item">
                            <div class="load-value">${loadAvg[1]?.toFixed(2) || '0.00'}</div>
                            <div>5分钟</div>
                        </div>
                        <div class="load-item">
                            <div class="load-value">${loadAvg[2]?.toFixed(2) || '0.00'}</div>
                            <div>15分钟</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderOfflineState(host, metrics) {
        const errorMessage = metrics?.error || '连接失败';
        
        return `
            <div class="offline-state">
                <div style="color: #e74c3c; font-weight: bold; margin: 20px 0;">
                    ❌ 主机离线
                </div>
                <div style="background: #fadbd8; padding: 10px; border-radius: 5px; color: #c0392b;">
                    <strong>错误信息:</strong> ${errorMessage}
                </div>
                <button class="btn" onclick="dashboard.testConnection(${host.id})" 
                        style="margin-top: 10px; background: #e74c3c; color: white;">
                    重新测试连接
                </button>
            </div>
        `;
    }

    async testConnection(hostId) {
        try {
            const response = await fetch(`${API_BASE}/api/test-connection/${hostId}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('连接测试成功', 'success');
                this.updateDashboard(); // 刷新数据
            } else {
                this.showMessage('连接测试失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('测试连接失败:', error);
            this.showMessage('测试连接失败: ' + error.message, 'error');
        }
    }

    async collectNow(hostId) {
        try {
            const response = await fetch(`${API_BASE}/api/collect-now/${hostId}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('数据采集成功', 'success');
                this.updateDashboard(); // 刷新数据
            } else {
                this.showMessage('采集失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('立即采集失败:', error);
            this.showMessage('采集失败: ' + error.message, 'error');
        }
    }

    showMessage(message, type) {
        // 创建消息元素
        const messageDiv = document.createElement('div');
        messageDiv.className = `alert alert-${type}`;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            max-width: 300px;
        `;
        messageDiv.textContent = message;
        
        // 添加到页面
        document.body.appendChild(messageDiv);
        
        // 3秒后自动移除
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }

    // 添加工具函数用于更新特定指标
    updateMetric(hostId, type, value) {
        const valueElement = document.getElementById(`${type}-${hostId}`);
        const barElement = document.getElementById(`${type}-bar-${hostId}`);

        if (valueElement) {
            valueElement.textContent = `${value.toFixed(1)}%`;
        }

        if (barElement) {
            barElement.style.width = `${Math.min(value, 100)}%`;
            
            // 根据数值设置颜色警告
            barElement.className = 'progress-bar';
            if (value > 90) {
                barElement.classList.add('danger');
            } else if (value > 80) {
                barElement.classList.add('warning');
            }
        }
    }

    // 设置主机离线状态
    setHostOffline(hostId) {
        const serverCard = document.getElementById(`server-${hostId}`);
        const statusElement = document.getElementById(`status-${hostId}`);

        if (statusElement) {
            statusElement.className = 'status-badge status-offline';
            statusElement.textContent = '离线';
            serverCard.classList.add('offline');
        }
    }
}

// 页面加载完成后初始化监控大屏
document.addEventListener('DOMContentLoaded', function() {
    window.dashboard = new Dashboard();
});

// 添加一些工具函数到全局作用域
window.refreshDashboard = function() {
    if (window.dashboard) {
        window.dashboard.manualRefresh();
    }
};

window.toggleAutoRefresh = function() {
    const checkbox = document.getElementById('autoRefresh');
    if (checkbox && window.dashboard) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            window.dashboard.startAutoRefresh();
        } else {
            window.dashboard.stopAutoRefresh();
        }
    }
};