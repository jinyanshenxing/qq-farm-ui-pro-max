#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
STACK_NAME="${STACK_NAME:-qq-farm}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
APP_CONTAINER_NAME_INPUT="${APP_CONTAINER_NAME:-}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME_INPUT:-${STACK_NAME}-bot}"
MYSQL_CONTAINER_NAME_INPUT="${MYSQL_CONTAINER_NAME:-}"
MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME_INPUT:-${STACK_NAME}-mysql}"
REDIS_CONTAINER_NAME_INPUT="${REDIS_CONTAINER_NAME:-}"
REDIS_CONTAINER_NAME="${REDIS_CONTAINER_NAME_INPUT:-${STACK_NAME}-redis}"
IPAD860_CONTAINER_NAME_INPUT="${IPAD860_CONTAINER_NAME:-}"
IPAD860_CONTAINER_NAME="${IPAD860_CONTAINER_NAME_INPUT:-${STACK_NAME}-ipad860}"
DOCKER=(docker)
SUDO=""
MYSQL_ADMIN_PASSWORD_USED=""
CURRENT_LINK_EXPLICIT=0
APP_CONTAINER_NAME_EXPLICIT=0
MYSQL_CONTAINER_NAME_EXPLICIT=0
REDIS_CONTAINER_NAME_EXPLICIT=0
IPAD860_CONTAINER_NAME_EXPLICIT=0
STACK_DIR_NAME=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_LAYOUT_PATH="${SCRIPT_DIR}/stack-layout.sh"
if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
    BOOTSTRAP_DIR="${TMPDIR:-/tmp}/qq-farm-deploy-bootstrap/${REPO_SLUG//\//_}/${REPO_REF}"
    mkdir -p "${BOOTSTRAP_DIR}"
    STACK_LAYOUT_PATH="${BOOTSTRAP_DIR}/stack-layout.sh"
    if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
        command -v curl >/dev/null 2>&1 || {
            echo "[ERROR] 缺少 stack-layout.sh 且系统未安装 curl，无法继续执行。" >&2
            exit 1
        }
        curl -fsSL "${RAW_BASE_URL}/scripts/deploy/stack-layout.sh" -o "${STACK_LAYOUT_PATH}"
    fi
fi
# shellcheck source=stack-layout.sh
. "${STACK_LAYOUT_PATH}"

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi
if [ -n "${APP_CONTAINER_NAME_INPUT}" ]; then
    APP_CONTAINER_NAME_EXPLICIT=1
fi
if [ -n "${MYSQL_CONTAINER_NAME_INPUT}" ]; then
    MYSQL_CONTAINER_NAME_EXPLICIT=1
fi
if [ -n "${REDIS_CONTAINER_NAME_INPUT}" ]; then
    REDIS_CONTAINER_NAME_EXPLICIT=1
fi
if [ -n "${IPAD860_CONTAINER_NAME_INPUT}" ]; then
    IPAD860_CONTAINER_NAME_EXPLICIT=1
fi

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    STACK_DIR_NAME="$(stack_dir_name "${STACK_NAME}")"
    if [ "${APP_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        APP_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "bot")"
    fi
    if [ "${MYSQL_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        MYSQL_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "mysql")"
    fi
    if [ "${REDIS_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        REDIS_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "redis")"
    fi
    if [ "${IPAD860_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        IPAD860_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "ipad860")"
    fi
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    fi
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --deploy-dir)
                DEPLOY_DIR="${2:-}"
                shift 2
                ;;
            --stack-name)
                STACK_NAME="${2:-}"
                shift 2
                ;;
            --non-interactive)
                NON_INTERACTIVE=1
                shift
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done

    refresh_stack_layout
}

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    SUDO="sudo"
fi

run_root() {
    if [ -n "${SUDO}" ]; then
        "${SUDO}" "$@"
    else
        "$@"
    fi
}

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_error "未检测到 Docker。"
        exit 1
    fi

    if docker info >/dev/null 2>&1; then
        DOCKER=(docker)
    elif [ -n "${SUDO}" ] && "${SUDO}" docker info >/dev/null 2>&1; then
        DOCKER=("${SUDO}" docker)
    else
        print_error "Docker daemon 不可访问。"
        exit 1
    fi

    "${DOCKER[@]}" compose version >/dev/null 2>&1 || {
        print_error "当前 Docker 缺少 compose v2，请升级 Docker。"
        exit 1
    }
}

canonicalize_dir() {
    local dir="$1"
    if [ -d "${dir}" ]; then
        (cd "${dir}" && pwd -P)
    fi
}

resolve_deploy_dir() {
    if [ -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${DEPLOY_DIR}")"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/docker-compose.yml" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${CURRENT_LINK}")"
            return 0
        fi
    fi

    local latest=""
    latest="$(find "${DEPLOY_BASE_DIR}" -mindepth 2 -maxdepth 2 -type d -name "${STACK_DIR_NAME:-$(stack_dir_name "${STACK_NAME}")}" 2>/dev/null | sort | tail -n 1)"
    if [ -n "${latest}" ] && [ -f "${latest}/docker-compose.yml" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${latest}")"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    print_error "未找到可用部署目录。请通过 --deploy-dir 指定。"
    exit 1
}

load_deploy_env() {
    local file="$1"
    if [ -f "${file}" ]; then
        set -a
        # shellcheck disable=SC1090
        . "${file}"
        set +a
        if [ -n "${APP_CONTAINER_NAME:-}" ]; then
            APP_CONTAINER_NAME_EXPLICIT=1
        fi
        if [ -n "${MYSQL_CONTAINER_NAME:-}" ]; then
            MYSQL_CONTAINER_NAME_EXPLICIT=1
        fi
        if [ -n "${REDIS_CONTAINER_NAME:-}" ]; then
            REDIS_CONTAINER_NAME_EXPLICIT=1
        fi
        if [ -n "${IPAD860_CONTAINER_NAME:-}" ]; then
            IPAD860_CONTAINER_NAME_EXPLICIT=1
        fi
        refresh_stack_layout
    fi
}

set_env_value() {
    local key="$1"
    local value="$2"
    local file="$3"
    local escaped="${value//&/\\&}"
    if grep -q "^${key}=" "${file}" 2>/dev/null; then
        sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "${file}"
        rm -f "${file}.bak"
    else
        printf '%s=%s\n' "${key}" "${value}" >> "${file}"
    fi
}

prompt_text() {
    local label="$1"
    local default_value="$2"
    local hint="${3:-}"
    local input=""

    if [ -n "${hint}" ]; then
        printf '%s：%s\n' "${label}" "${hint}" >&2
    fi
    if [ "${NON_INTERACTIVE}" = "1" ]; then
        printf '%s\n' "${default_value}"
        return 0
    fi

    printf '%s [%s]: ' "${label}" "${default_value}" >&2
    read -r input
    printf '%s\n' "${input:-${default_value}}"
}

prompt_secret() {
    local label="$1"
    local default_value="$2"
    local hint="${3:-}"
    local input=""

    if [ -n "${hint}" ]; then
        printf '%s：%s\n' "${label}" "${hint}" >&2
    fi
    if [ "${NON_INTERACTIVE}" = "1" ]; then
        printf '%s\n' "${default_value}"
        return 0
    fi

    printf '%s [%s]: ' "${label}" "${default_value:+留空保持当前/默认}" >&2
    read -r -s input
    printf '\n' >&2
    printf '%s\n' "${input:-${default_value}}"
}

sql_escape_literal() {
    printf '%s' "$1" | sed "s/'/''/g"
}

sql_escape_ident() {
    printf '%s' "$1" | sed 's/`/``/g'
}

container_is_running() {
    local container_name="$1"
    [ "$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${container_name}" 2>/dev/null || echo missing)" = "running" ]
}

container_health() {
    "${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null || echo "none"
}

wait_for_container() {
    local container_name="$1"
    local timeout="${2:-240}"
    local require_healthy="${3:-0}"
    local started_at
    started_at="$(date +%s)"

    while true; do
        local status="missing"
        local health="none"
        status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${container_name}" 2>/dev/null || echo "missing")"
        health="$(container_health "${container_name}")"

        if [ "${status}" = "running" ]; then
            if [ "${require_healthy}" != "1" ] || [ "${health}" = "healthy" ] || [ "${health}" = "none" ]; then
                return 0
            fi
        fi

        if [ $(( $(date +%s) - started_at )) -ge "${timeout}" ]; then
            print_warning "等待容器超时: ${container_name} (${status}/${health})"
            return 1
        fi

        sleep 3
    done
}

mysql_admin_exec() {
    local password="$1"
    shift
    "${DOCKER[@]}" compose exec -T mysql "$@" -u root -p"${password}"
}

detect_mysql_admin_password() {
    local candidate=""
    for candidate in "${OLD_MYSQL_ROOT_PASSWORD}" "${MYSQL_ROOT_PASSWORD}"; do
        if [ -z "${candidate}" ]; then
            continue
        fi
        if "${DOCKER[@]}" compose exec -T mysql mysqladmin --protocol=TCP -h 127.0.0.1 -u root -p"${candidate}" ping >/dev/null 2>&1; then
            MYSQL_ADMIN_PASSWORD_USED="${candidate}"
            return 0
        fi
    done
    return 1
}

apply_env_changes() {
    local env_file="${DEPLOY_DIR}/.env"
    set_env_value "WEB_PORT" "${WEB_PORT}" "${env_file}"
    set_env_value "MYSQL_ROOT_PASSWORD" "${MYSQL_ROOT_PASSWORD}" "${env_file}"
    set_env_value "MYSQL_DATABASE" "${MYSQL_DATABASE}" "${env_file}"
    set_env_value "MYSQL_USER" "${MYSQL_USER}" "${env_file}"
    set_env_value "MYSQL_PASSWORD" "${MYSQL_PASSWORD}" "${env_file}"
    set_env_value "REDIS_PASSWORD" "${REDIS_PASSWORD}" "${env_file}"
    set_env_value "WX_API_KEY" "${WX_API_KEY}" "${env_file}"
    set_env_value "WX_API_URL" "${WX_API_URL}" "${env_file}"
    set_env_value "WX_APP_ID" "${WX_APP_ID}" "${env_file}"
}

sync_mysql_accounts() {
    if ! container_is_running "${MYSQL_CONTAINER_NAME}"; then
        print_warning "MySQL 容器当前未运行，先跳过账号同步。稍后会通过 docker compose up -d 拉起。"
        return 0
    fi

    if ! detect_mysql_admin_password; then
        print_warning "无法使用旧/新 root 密码连接 MySQL，跳过账号同步。"
        return 0
    fi

    local db_ident=""
    local user_escaped=""
    local pass_escaped=""
    local root_escaped=""
    local root_hosts=""
    local host=""

    db_ident="$(sql_escape_ident "${MYSQL_DATABASE}")"
    user_escaped="$(sql_escape_literal "${MYSQL_USER}")"
    pass_escaped="$(sql_escape_literal "${MYSQL_PASSWORD}")"
    root_escaped="$(sql_escape_literal "${MYSQL_ROOT_PASSWORD}")"

    print_info "同步 MySQL 数据库与业务账号..."
    if [ "${OLD_MYSQL_DATABASE}" != "${MYSQL_DATABASE}" ]; then
        print_warning "检测到数据库名变更: ${OLD_MYSQL_DATABASE} -> ${MYSQL_DATABASE}"
        print_warning "该操作会创建新库并初始化结构，不会自动迁移旧库数据。"
    fi

    mysql_admin_exec "${MYSQL_ADMIN_PASSWORD_USED}" mysql --protocol=TCP -h 127.0.0.1 -Nse \
        "CREATE DATABASE IF NOT EXISTS \`${db_ident}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
         CREATE USER IF NOT EXISTS '${user_escaped}'@'%' IDENTIFIED BY '${pass_escaped}';
         ALTER USER '${user_escaped}'@'%' IDENTIFIED BY '${pass_escaped}';
         GRANT ALL PRIVILEGES ON \`${db_ident}\`.* TO '${user_escaped}'@'%';
         FLUSH PRIVILEGES;" >/dev/null

    root_hosts="$("${DOCKER[@]}" compose exec -T mysql mysql --protocol=TCP -h 127.0.0.1 -u root -p"${MYSQL_ADMIN_PASSWORD_USED}" -Nse "SELECT Host FROM mysql.user WHERE User = 'root';" 2>/dev/null || true)"
    while IFS= read -r host; do
        [ -n "${host}" ] || continue
        mysql_admin_exec "${MYSQL_ADMIN_PASSWORD_USED}" mysql --protocol=TCP -h 127.0.0.1 -Nse \
            "ALTER USER 'root'@'$(sql_escape_literal "${host}")' IDENTIFIED BY '${root_escaped}';" >/dev/null 2>&1 || true
    done <<EOF
${root_hosts}
EOF

    MYSQL_ADMIN_PASSWORD_USED="${MYSQL_ROOT_PASSWORD}"
    print_success "MySQL 账号参数已同步。"
}

restart_related_services() {
    print_info "重启主程序 / MySQL / Redis / 微信扫码服务以加载新配置..."
    (cd "${DEPLOY_DIR}" && "${DOCKER[@]}" compose up -d mysql redis ipad860 qq-farm-bot)
    wait_for_container "${MYSQL_CONTAINER_NAME}" 240 1 || true
    wait_for_container "${REDIS_CONTAINER_NAME}" 120 0 || true
    wait_for_container "${IPAD860_CONTAINER_NAME}" 180 0 || true
    wait_for_container "${APP_CONTAINER_NAME}" 240 1 || true
}

run_schema_repair() {
    if [ -x "${DEPLOY_DIR}/repair-mysql.sh" ]; then
        print_info "执行数据库结构修复..."
        "${DEPLOY_DIR}/repair-mysql.sh" --deploy-dir "${DEPLOY_DIR}"
    else
        print_warning "未检测到 repair-mysql.sh，跳过数据库结构修复。"
    fi
}

run_verify() {
    if [ -x "${DEPLOY_DIR}/verify-stack.sh" ]; then
        "${DEPLOY_DIR}/verify-stack.sh" --deploy-dir "${DEPLOY_DIR}"
    else
        print_warning "未检测到 verify-stack.sh，跳过自动核验。"
    fi
}

confirm_changes() {
    echo ""
    echo "即将应用以下配置："
    echo "- Web 端口: ${WEB_PORT}"
    echo "- MySQL: mysql:3306 / ${MYSQL_DATABASE} / ${MYSQL_USER}"
    echo "- Redis: redis:6379 / password=$( [ -n "${REDIS_PASSWORD}" ] && echo '已设置' || echo '留空' )"
    echo "- 微信扫码服务: http://ipad860:8058"
    echo "- 第三方扫码接口: WX_API_URL=${WX_API_URL:-"(empty)"} / WX_APP_ID=${WX_APP_ID:-"(empty)"} / WX_API_KEY=$( [ -n "${WX_API_KEY}" ] && echo '已设置' || echo '留空' )"
    echo ""

    if [ "${NON_INTERACTIVE}" = "1" ]; then
        return 0
    fi

    local answer=""
    read -r -p "确认写入并重试连通检查吗？[Y/n]: " answer
    case "${answer:-Y}" in
        n|N)
            print_warning "已取消写入。"
            return 1
            ;;
    esac
    return 0
}

main() {
    parse_args "$@"
    ensure_docker
    resolve_deploy_dir
    cd "${DEPLOY_DIR}"
    load_deploy_env "${DEPLOY_DIR}/.env"

    WEB_PORT="${WEB_PORT:-3080}"
    OLD_MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-qq007qq008}"
    OLD_MYSQL_DATABASE="${MYSQL_DATABASE:-qq_farm}"
    OLD_MYSQL_USER="${MYSQL_USER:-qq_farm_user}"
    OLD_MYSQL_PASSWORD="${MYSQL_PASSWORD:-qq007qq008}"
    OLD_REDIS_PASSWORD="${REDIS_PASSWORD:-}"
    OLD_WX_API_KEY="${WX_API_KEY:-}"
    OLD_WX_API_URL="${WX_API_URL:-}"
    OLD_WX_APP_ID="${WX_APP_ID:-}"

    echo ""
    echo "=========================================="
    echo "  手动配置修复向导"
    echo "=========================================="
    echo "部署目录: ${DEPLOY_DIR}"
    echo "说明:"
    echo "- 集成栈内部固定地址为 mysql:3306 / redis:6379 / http://ipad860:8058"
    echo "- 如在已有生产库上修改 MYSQL_DATABASE，新库会被创建，但旧库数据不会自动迁移"
    echo "- 直接回车表示保持当前值"
    echo ""

    WEB_PORT="$(prompt_text "Web 后台端口" "${WEB_PORT}" "默认 3080，对外访问地址使用这个端口")"
    MYSQL_ROOT_PASSWORD="$(prompt_secret "MySQL root 密码" "${OLD_MYSQL_ROOT_PASSWORD}" "默认 qq007qq008，repair 脚本会使用它")"
    MYSQL_DATABASE="$(prompt_text "MySQL 数据库名" "${OLD_MYSQL_DATABASE}" "默认 qq_farm，生产环境建议保持原值")"
    MYSQL_USER="$(prompt_text "MySQL 业务用户名" "${OLD_MYSQL_USER}" "默认 qq_farm_user")"
    MYSQL_PASSWORD="$(prompt_secret "MySQL 业务密码" "${OLD_MYSQL_PASSWORD}" "默认 qq007qq008")"
    REDIS_PASSWORD="$(prompt_secret "Redis 密码" "${OLD_REDIS_PASSWORD}" "可留空；如设置，主程序和 ipad860 会共用它")"
    WX_API_KEY="$(prompt_secret "微信登录 API Key" "${OLD_WX_API_KEY}" "无第三方接口时可留空")"
    WX_API_URL="$(prompt_text "微信登录请求网关" "${OLD_WX_API_URL}" "例如 https://example.com 或留空")"
    WX_APP_ID="$(prompt_text "QQ 农场 AppId" "${OLD_WX_APP_ID}" "无第三方接口时可留空")"

    confirm_changes || exit 1
    apply_env_changes
    restart_related_services
    sync_mysql_accounts
    run_schema_repair
    restart_related_services
    run_verify
}

main "$@"
