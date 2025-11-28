#!/bin/bash

# 服务器监控系统一键部署脚本
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示横幅
show_banner() {
    echo -e "${GREEN}"
    echo "============================================="
    echo "   服务器实时监控数据大屏系统部署脚本"
    echo "============================================="
    echo -e "${NC}"
}

# 主部署函数
deploy() {
    show_banner
    
    log_info "开始部署服务器监控系统..."
    
    # 1. 检查前置条件
    log_info "步骤 1/6: 检查系统环境..."
    
    # 检查 Docker 是否安装
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi

    # 检查 Docker Compose 是否安装
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    # 检查当前目录
    if [ ! -f "docker/docker-compose.yml" ]; then
        log_error "请在项目根目录运行此脚本"
        log_info "当前目录: $(pwd)"
        exit 1
    fi
    
    # 2. 创建必要的目录
    log_info "步骤 2/6: 创建数据目录..."
    mkdir -p data
    mkdir -p logs
    chmod -R 755 data
    chmod -R 755 logs
    
    # 3. 检查前端文件是否存在
    log_info "步骤 3/6: 检查前端文件..."
    if [ ! -f "frontend/index.html" ]; then
        log_warning "前端文件不存在，将使用基础版本..."
        # 创建基础前端目录结构
        mkdir -p frontend/css frontend/js
        # 这里可以添加生成基础前端文件的逻辑
    else
        log_success "前端文件检查通过"
    fi
    
    # 4. 构建 Docker 镜像
    log_info "步骤 4/6: 构建 Docker 镜像..."
    docker-compose -f docker/docker-compose.yml build --no-cache
    
    if [ $? -ne 0 ]; then
        log_error "Docker 镜像构建失败"
        exit 1
    fi
    log_success "Docker 镜像构建成功"
    
    # 5. 启动服务
    log_info "步骤 5/6: 启动监控服务..."
    docker-compose -f docker/docker-compose.yml up -d
    
    if [ $? -ne 0 ]; then
        log_error "服务启动失败"
        exit 1
    fi
    log_success "服务启动成功"
    
    # 6. 等待服务就绪并检查状态
    log_info "步骤 6/6: 检查服务状态..."
    sleep 10  # 等待服务启动
    
    check_service_health
}

# 检查服务健康状态
check_service_health() {
    log_info "检查服务健康状态..."
    
    # 检查容器状态
    if docker ps | grep server-monitor > /dev/null; then
        log_success "监控服务容器运行正常"
    else
        log_error "监控服务容器未运行"
        docker-compose -f docker/docker-compose.yml logs
        exit 1
    fi
    
    # 检查服务是否可访问
    local max_retries=10
    local retry_count=0
    
    while [ $retry_count -lt $max_retries ]; do
        if curl -f http://localhost:5000/health > /dev/null 2>&1; then
            log_success "监控系统服务已就绪"
            show_success_info
            return 0
        fi
        
        log_info "等待服务启动... ($((retry_count + 1))/$max_retries)"
        sleep 5
        ((retry_count++))
    done
    
    log_error "服务启动超时，请检查日志"
    docker-compose -f docker/docker-compose.yml logs
    exit 1
}

# 显示成功信息
show_success_info() {
    echo -e "${GREEN}"
    echo "============================================="
    echo "           部署成功！🎉"
    echo "============================================="
    echo -e "${NC}"
    echo ""
    echo "📊 ${GREEN}监控系统访问地址:${NC}"
    echo "   主机管理: http://localhost:5000"
    echo "   监控大屏: http://localhost:5000/dashboard"
    echo "   健康检查: http://localhost:5000/health"
    echo ""
    echo "🔧 ${YELLOW}管理命令:${NC}"
    echo "   查看日志: docker-compose -f docker/docker-compose.yml logs"
    echo "   停止服务: docker-compose -f docker/docker-compose.yml down"
    echo "   重启服务: docker-compose -f docker/docker-compose.yml restart"
    echo "   状态检查: docker-compose -f docker/docker-compose.yml ps"
    echo ""
    echo "📝 ${BLUE}使用说明:${NC}"
    echo "   1. 访问主机管理页面添加服务器"
    echo "   2. 在监控大屏查看实时数据"
    echo "   3. 支持真实服务器和模拟主机"
    echo "   4. 系统会自动每30秒采集一次数据"
    echo ""
}

# 主脚本逻辑
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "stop")
        docker-compose -f docker/docker-compose.yml down
        ;;
    "restart")
        docker-compose -f docker/docker-compose.yml restart
        ;;
    "status")
        docker-compose -f docker/docker-compose.yml ps
        ;;
    "logs")
        docker-compose -f docker/docker-compose.yml logs -f
        ;;
    "help")
        echo "使用方法: $0 [命令]"
        echo "命令: deploy, stop, restart, status, logs, help"
        ;;
    *)
        log_error "未知命令: $1"
        echo "使用方法: $0 [deploy|stop|restart|status|logs|help]"
        exit 1
        ;;
esac