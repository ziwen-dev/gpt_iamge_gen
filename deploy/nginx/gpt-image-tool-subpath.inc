# 绘境子路径：在已有 server { listen 80; }（如 game.conf）内、location / 之前 include
#   include /etc/nginx/conf.d/gpt-image-tool-locations.inc;
#
# 访问 http://39.105.53.245/image_gpt/
# 静态：$document_root/image_gpt/  （与主站 index.html 同级，如 /docker/nginx/html/image_gpt/）

    location = /image_gpt {
        return 301 /image_gpt/;
    }

    location ^~ /image_gpt/api/edit {
        rewrite ^/image_gpt(/api/.*)$ $1 break;
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

    location ^~ /image_gpt/api/ {
        rewrite ^/image_gpt(/api/.*)$ $1 break;
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

    location ^~ /image_gpt/assets/ {
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public";
        access_log off;
    }

    location = /image_gpt/index.html {
        add_header Cache-Control "no-cache";
    }

    location ^~ /image_gpt/ {
        try_files $uri $uri/ /image_gpt/index.html;
    }
