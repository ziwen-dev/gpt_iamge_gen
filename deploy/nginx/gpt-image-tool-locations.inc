# 由 gpt-image-tool.conf 在 server { } 内 include
# 与主配置放在同一目录（如 /etc/nginx/sites-available/）

    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Vue 构建：带 hash 的 JS/CSS（长期缓存）
    location ~* ^/assets/.+\.(js|css)$ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # public/assets 风格图等
    location /assets/ {
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public";
        access_log off;
    }

    # 图生图上传：超时需 ≥ GPT_IMAGE_TIMEOUT（默认 1200s）
    location = /api/edit {
        proxy_pass http://gpt_image_tool_backend;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        client_max_body_size 55m;
        proxy_connect_timeout 60s;
        proxy_send_timeout    1200s;
        proxy_read_timeout    1200s;
        proxy_request_buffering on;
        proxy_redirect off;
    }

    location = /api/health {
        proxy_pass http://gpt_image_tool_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    location /api/ {
        proxy_pass http://gpt_image_tool_backend;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        proxy_connect_timeout 60s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
        proxy_redirect off;
    }

    location = /index.html {
        try_files $uri =404;
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
