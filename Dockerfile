# =============================================================================
# DOCKER COMPOSE - PRODUCTION CONFIGURATION
# =============================================================================

version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: trevi_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-leave_management}
      POSTGRES_USER: ${POSTGRES_USER:-leave_admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secure_password_123}
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations/init.sql:/docker-entrypoint-initdb.d/init.sql
      - ./backups:/backups
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    networks:
      - trevi_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-leave_admin} -d ${POSTGRES_DB:-leave_management}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    command: >
      postgres
      -c shared_preload_libraries=pg_stat_statements
      -c pg_stat_statements.max=10000
      -c pg_stat_statements.track=all
      -c max_connections=100
      -c shared_buffers=256MB
      -c effective_cache_size=1GB
      -c maintenance_work_mem=64MB
      -c checkpoint_completion_target=0.9
      -c wal_buffers=16MB
      -c default_statistics_target=100

  # Redis for Caching and Sessions
  redis:
    image: redis:7-alpine
    container_name: trevi_redis
    restart: unless-stopped
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf
    networks:
      - trevi_network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: redis-server /usr/local/etc/redis/redis.conf
    sysctls:
      - net.core.somaxconn=65535

  # Node.js API Server
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: trevi_api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://${POSTGRES_USER:-leave_admin}:${POSTGRES_PASSWORD:-secure_password_123}@postgres:5432/${POSTGRES_DB:-leave_management}
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL:-http://localhost:8080}
      EMAIL_HOST: ${EMAIL_HOST}
      EMAIL_PORT: ${EMAIL_PORT:-587}
      EMAIL_USER: ${EMAIL_USER}
      EMAIL_PASSWORD: ${EMAIL_PASSWORD}
      EMAIL_FROM: ${EMAIL_FROM}
      MAX_FILE_SIZE: ${MAX_FILE_SIZE:-5242880}
      RATE_LIMIT_WINDOW: ${RATE_LIMIT_WINDOW:-900000}
      RATE_LIMIT_MAX: ${RATE_LIMIT_MAX:-100}
    ports:
      - "${API_PORT:-3000}:3000"
    volumes:
      - api_uploads:/app/uploads
      - api_logs:/app/logs
    networks:
      - trevi_network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'

  # Frontend Web Server
  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    container_name: trevi_frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-8080}:80"
    networks:
      - trevi_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: '0.2'

  # Nginx Reverse Proxy
  nginx:
    build:
      context: .
      dockerfile: nginx.Dockerfile
    container_name: trevi_nginx
    restart: unless-stopped
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx
    networks:
      - trevi_network
    depends_on:
      - api
      - frontend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.3'

  # Database Backup Service
  backup:
    image: postgres:15-alpine
    container_name: trevi_backup
    restart: "no"
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-leave_management}
      POSTGRES_USER: ${POSTGRES_USER:-leave_admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secure_password_123}
    volumes:
      - ./backups:/backups
      - ./scripts/backup.sh:/backup.sh
    networks:
      - trevi_network
    depends_on:
      postgres:
        condition: service_healthy
    command: ["sh", "/backup.sh"]
    profiles: ["backup"]

  # Log Aggregation with ELK Stack (Optional)
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.8.0
    container_name: trevi_elasticsearch
    restart: unless-stopped
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.security.enabled=false
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    networks:
      - trevi_network
    profiles: ["logging"]

  logstash:
    image: docker.elastic.co/logstash/logstash:8.8.0
    container_name: trevi_logstash
    restart: unless-stopped
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
      - api_logs:/logs
    networks:
      - trevi_network
    depends_on:
      - elasticsearch
    profiles: ["logging"]

  kibana:
    image: docker.elastic.co/kibana/kibana:8.8.0
    container_name: trevi_kibana
    restart: unless-stopped
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    networks:
      - trevi_network
    depends_on:
      - elasticsearch
    profiles: ["logging"]

  # Monitoring with Prometheus and Grafana
  prometheus:
    image: prom/prometheus:latest
    container_name: trevi_prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
    networks:
      - trevi_network
    profiles: ["monitoring"]

  grafana:
    image: grafana/grafana:latest
    container_name: trevi_grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin123}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    networks:
      - trevi_network
    depends_on:
      - prometheus
    profiles: ["monitoring"]

# =============================================================================
# VOLUMES
# =============================================================================

volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/postgres
  
  redis_data:
    driver: local
    
  api_uploads:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./uploads
      
  api_logs:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./logs
      
  nginx_logs:
    driver: local
    
  elasticsearch_data:
    driver: local
    
  prometheus_data:
    driver: local
    
  grafana_data:
    driver: local

# =============================================================================
# NETWORKS
# =============================================================================

networks:
  trevi_network:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1

# =============================================================================
# DOCKER COMPOSE - DEVELOPMENT CONFIGURATION
# =============================================================================

---
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: trevi_postgres_dev
    environment:
      POSTGRES_DB: leave_management_dev
      POSTGRES_USER: dev_user
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5433:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    networks:
      - trevi_dev_network

  redis:
    image: redis:7-alpine
    container_name: trevi_redis_dev
    ports:
      - "6380:6379"
    networks:
      - trevi_dev_network

  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    container_name: trevi_api_dev
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://dev_user:dev_password@postgres:5432/leave_management_dev
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev_jwt_secret_key
      FRONTEND_URL: http://localhost:3001
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - dev_uploads:/app/uploads
    networks:
      - trevi_dev_network
    depends_on:
      - postgres
      - redis
    command: npm run dev

  # pgAdmin for database management
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: trevi_pgadmin_dev
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@trevi.com
      PGADMIN_DEFAULT_PASSWORD: admin123
    ports:
      - "5050:80"
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    networks:
      - trevi_dev_network
    depends_on:
      - postgres

volumes:
  postgres_dev_data:
  dev_uploads:
  pgadmin_data:

networks:
  trevi_dev_network:
    driver: bridge