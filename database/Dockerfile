FROM mysql:8.0

# Copy init script — executed on first startup only
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql

# MySQL default config overrides for performance + charset
RUN echo "[mysqld]\n\
character-set-server=utf8mb4\n\
collation-server=utf8mb4_unicode_ci\n\
max_connections=100\n\
innodb_buffer_pool_size=256M\n\
" > /etc/mysql/conf.d/custom.cnf

EXPOSE 3306
