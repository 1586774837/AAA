FROM python:3.9-slim

WORKDIR /app

# 复制精简的依赖文件
COPY backend/requirements.txt .

# 使用国内镜像源安装核心依赖
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn --timeout 60

COPY backend/ .
COPY frontend/ ./frontend/

RUN mkdir -p data

EXPOSE 5000

ENV FLASK_APP=app.py
ENV FLASK_ENV=production

CMD ["python", "app.py"]