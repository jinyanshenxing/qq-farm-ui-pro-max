#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="QQ 农场智能助手"
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
DATE_STAMP="$(date +%Y_%m_%d)"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
STACK_NAME="${STACK_NAME:-qq-farm}"
DEPLOY_DIR="${DEPLOY_DIR:-${DEPLOY_BASE_DIR}/${DATE_STAMP}/qq-farm-bot}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
SOURCE_CACHE_DIR_INPUT="${SOURCE_CACHE_DIR:-}"
APP_CONTAINER_NAME_INPUT="${APP_CONTAINER_NAME:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
SOURCE_CACHE_DIR="${SOURCE_CACHE_DIR_INPUT:-${DEPLOY_BASE_DIR}/.qq-farm-build-src/${REPO_REF}}"
ACTION_MODE="${ACTION_MODE:-auto}"
UPDATE_MODE="${UPDATE_MODE:-prompt}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
IMAGE_ARCHIVE_OVERRIDE="${IMAGE_ARCHIVE_OVERRIDE:-${IMAGE_ARCHIVE:-}}"
APP_IMAGE_OVERRIDE="${APP_IMAGE_OVERRIDE:-}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"
WEB_PORT_OVERRIDE="${WEB_PORT_OVERRIDE:-}"
DOCKER=(docker)
SUDO=""
DEPLOY_DIR_EXPLICIT=0
CURRENT_LINK_EXPLICIT=0
SOURCE_CACHE_DIR_EXPLICIT=0
LAST_BACKUP_DIR=""
STACK_DIR_NAME=""
APP_CONTAINER_NAME="${APP_CONTAINER_NAME_INPUT:-}"
APP_CONTAINER_NAME_EXPLICIT=0

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi
if [ -n "${SOURCE_CACHE_DIR_INPUT}" ]; then
    SOURCE_CACHE_DIR_EXPLICIT=1
fi
if [ -n "${APP_CONTAINER_NAME_INPUT}" ]; then
    APP_CONTAINER_NAME_EXPLICIT=1
fi

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

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    STACK_DIR_NAME="$(stack_dir_name "${STACK_NAME}")"
    if [ "${APP_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        APP_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "bot")"
    fi

    if [ "${DEPLOY_DIR_EXPLICIT}" != "1" ]; then
        DEPLOY_DIR="${DEPLOY_BASE_DIR}/${DATE_STAMP}/${STACK_DIR_NAME}"
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
                DEPLOY_DIR_EXPLICIT=1
                shift 2
                ;;
            --deploy-base-dir)
                DEPLOY_BASE_DIR="${2:-}"
                shift 2
                ;;
            --stack-name)
                STACK_NAME="${2:-}"
                shift 2
                ;;
            --action)
                ACTION_MODE="${2:-auto}"
                shift 2
                ;;
            --preserve-current)
                UPDATE_MODE="preserve"
                shift
                ;;
            --overwrite)
                UPDATE_MODE="overwrite"
                shift
                ;;
            --non-interactive)
                NON_INTERACTIVE=1
                shift
                ;;
            --image)
                APP_IMAGE_OVERRIDE="${2:-}"
                shift 2
                ;;
            --image-archive)
                IMAGE_ARCHIVE_OVERRIDE="${2:-}"
                shift 2
                ;;
            --web-port)
                WEB_PORT_OVERRIDE="${2:-}"
                shift 2
                ;;
            --skip-verify)
                SKIP_VERIFY=1
                shift
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done

    refresh_stack_layout
    if [ "${SOURCE_CACHE_DIR_EXPLICIT}" != "1" ]; then
        SOURCE_CACHE_DIR="${DEPLOY_BASE_DIR}/.qq-farm-build-src/${REPO_REF}"
    fi
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

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "缺少命令: $1"
        exit 1
    fi
}

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_warning "未检测到 Docker，开始自动安装。"
        require_cmd curl
        curl -fsSL https://get.docker.com | run_root sh
        run_root systemctl enable docker >/dev/null 2>&1 || true
        run_root systemctl start docker >/dev/null 2>&1 || true
    fi

    if docker info >/dev/null 2>&1; then
        DOCKER=(docker)
    elif [ -n "${SUDO}" ] && "${SUDO}" docker info >/dev/null 2>&1; then
        DOCKER=("${SUDO}" docker)
    else
        print_error "Docker 已安装，但当前用户无法访问 Docker daemon。"
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

find_existing_deploy_dir() {
    local candidate=""

    if [ "${DEPLOY_DIR_EXPLICIT}" = "1" ] && [ -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
        canonicalize_dir "${DEPLOY_DIR}"
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/docker-compose.yml" ]; then
            canonicalize_dir "${CURRENT_LINK}"
            return 0
        fi
    fi

    candidate="$(find "${DEPLOY_BASE_DIR}" -mindepth 2 -maxdepth 2 -type d -name "${STACK_DIR_NAME}" 2>/dev/null | sort | tail -n 1)"
    if [ -n "${candidate}" ] && [ -f "${candidate}/docker-compose.yml" ]; then
        canonicalize_dir "${candidate}"
        return 0
    fi

    candidate="$("${DOCKER[@]}" inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"
    if [ -n "${candidate}" ] && [ -f "${candidate}/docker-compose.yml" ]; then
        canonicalize_dir "${candidate}"
        return 0
    fi

    return 1
}

choose_update_mode() {
    if [ "${UPDATE_MODE}" = "preserve" ] || [ "${UPDATE_MODE}" = "overwrite" ]; then
        return 0
    fi

    if [ "${NON_INTERACTIVE}" = "1" ]; then
        UPDATE_MODE="preserve"
        print_warning "非交互模式默认保留当前版本目录备份。"
        return 0
    fi

    echo "检测到已有部署。更新方式："
    echo "1) 保留当前版本目录备份后更新（推荐）"
    echo "2) 直接覆盖当前部署目录"
    read -r -p "请选择 [1/2]（默认 1）: " answer
    case "${answer:-1}" in
        2)
            UPDATE_MODE="overwrite"
            ;;
        *)
            UPDATE_MODE="preserve"
            ;;
    esac
}

create_backup_if_needed() {
    local source_dir="$1"
    if [ "${UPDATE_MODE}" != "preserve" ]; then
        return 0
    fi

    LAST_BACKUP_DIR="${DEPLOY_BASE_DIR}/backups/${STACK_DIR_NAME}-$(date +%Y%m%d_%H%M%S)"
    run_root mkdir -p "$(dirname "${LAST_BACKUP_DIR}")"
    print_info "当前实例 ${STACK_NAME} 将先备份目录，再原地更新。"
    print_info "开始备份当前部署目录到: ${LAST_BACKUP_DIR}"
    run_root cp -a "${source_dir}" "${LAST_BACKUP_DIR}"
    print_success "旧版本目录已备份: ${LAST_BACKUP_DIR}"
}

offer_manual_repair() {
    local deploy_dir="$1"
    local reason="$2"

    if [ ! -f "${deploy_dir}/.env" ]; then
        print_warning "${reason}，但当前部署目录还没有可修复的 .env。"
        return 1
    fi

    if [ "${NON_INTERACTIVE}" = "1" ]; then
        print_warning "${reason}。非交互模式下不会自动进入手动修复。"
        echo "可手动执行: ${SCRIPT_DIR}/manual-config-wizard.sh --deploy-dir ${deploy_dir}"
        return 1
    fi

    print_warning "${reason}"
    local answer=""
    read -r -p "是否立即进入手动配置修复向导？[Y/n]: " answer
    case "${answer:-Y}" in
        n|N)
            return 1
            ;;
    esac

    STACK_NAME="${STACK_NAME}" bash "${SCRIPT_DIR}/manual-config-wizard.sh" --deploy-dir "${deploy_dir}"
}

run_verify() {
    local deploy_dir="$1"
    if [ "${SKIP_VERIFY}" = "1" ] || [ "${SKIP_VERIFY}" = "true" ]; then
        print_warning "已跳过安装后核验。"
        return 0
    fi

    if STACK_NAME="${STACK_NAME}" CURRENT_LINK="${CURRENT_LINK}" bash "${SCRIPT_DIR}/verify-stack.sh" --deploy-dir "${deploy_dir}"; then
        return 0
    fi

    offer_manual_repair "${deploy_dir}" "安装后核验未通过"
}

run_install_flow() {
    local target_dir="${DEPLOY_DIR}"
    local cmd=(bash "${SCRIPT_DIR}/fresh-install.sh" "--deploy-dir" "${target_dir}")

    if [ "${NON_INTERACTIVE}" = "1" ]; then
        cmd+=("--non-interactive")
    fi
    if [ -n "${WEB_PORT_OVERRIDE}" ]; then
        cmd+=("--web-port" "${WEB_PORT_OVERRIDE}")
    fi
    if [ -n "${IMAGE_ARCHIVE_OVERRIDE}" ]; then
        cmd+=("--image-archive" "${IMAGE_ARCHIVE_OVERRIDE}")
    fi

    print_info "进入全新安装流程: ${target_dir}"
    if [ -n "${APP_IMAGE_OVERRIDE}" ]; then
        if ! STACK_NAME="${STACK_NAME}" CURRENT_LINK="${CURRENT_LINK}" SOURCE_CACHE_DIR="${SOURCE_CACHE_DIR}" APP_IMAGE="${APP_IMAGE_OVERRIDE}" "${cmd[@]}"; then
            offer_manual_repair "${target_dir}" "全新安装流程失败"
            return 1
        fi
    else
        if ! STACK_NAME="${STACK_NAME}" CURRENT_LINK="${CURRENT_LINK}" SOURCE_CACHE_DIR="${SOURCE_CACHE_DIR}" "${cmd[@]}"; then
            offer_manual_repair "${target_dir}" "全新安装流程失败"
            return 1
        fi
    fi

    run_verify "${target_dir}"
}

run_update_flow() {
    local existing_dir="$1"
    local cmd=(bash "${SCRIPT_DIR}/update-app.sh" "--deploy-dir" "${existing_dir}")

    choose_update_mode
    create_backup_if_needed "${existing_dir}"

    if [ -n "${APP_IMAGE_OVERRIDE}" ]; then
        cmd+=("--image" "${APP_IMAGE_OVERRIDE}")
    fi
    if [ -n "${IMAGE_ARCHIVE_OVERRIDE}" ]; then
        cmd+=("--image-archive" "${IMAGE_ARCHIVE_OVERRIDE}")
    fi

    print_info "进入更新流程: ${existing_dir}"
    if ! STACK_NAME="${STACK_NAME}" CURRENT_LINK="${CURRENT_LINK}" SOURCE_CACHE_DIR="${SOURCE_CACHE_DIR}" "${cmd[@]}"; then
        offer_manual_repair "${existing_dir}" "更新流程失败"
        return 1
    fi
    run_verify "${existing_dir}"
}

main() {
    parse_args "$@"

    echo ""
    echo "=========================================="
    echo "  ${APP_NAME} - 统一安装 / 更新入口"
    echo "=========================================="
    echo ""

    require_cmd date
    require_cmd mkdir
    require_cmd chmod
    require_cmd grep
    require_cmd sed
    ensure_docker

    local existing_dir=""
    if existing_dir="$(find_existing_deploy_dir)"; then
        print_info "检测到已有部署目录: ${existing_dir}"
    fi

    if [ "${ACTION_MODE}" = "install" ]; then
        run_install_flow
    elif [ "${ACTION_MODE}" = "update" ]; then
        if [ -z "${existing_dir}" ]; then
            print_error "未检测到可更新部署，请改用安装模式。"
            exit 1
        fi
        run_update_flow "${existing_dir}"
    else
        if [ -n "${existing_dir}" ]; then
            run_update_flow "${existing_dir}"
        else
            run_install_flow
        fi
    fi

    echo ""
    print_success "统一入口执行完成。"
    echo "实例名称: ${STACK_NAME}"
    if [ -n "${LAST_BACKUP_DIR}" ]; then
        echo "旧版本目录备份: ${LAST_BACKUP_DIR}"
    fi
    echo "统一入口脚本: ${SCRIPT_DIR}/install-or-update.sh"
    echo "安装后核验脚本: ${SCRIPT_DIR}/verify-stack.sh"
    echo "手动修复向导: ${SCRIPT_DIR}/manual-config-wizard.sh"
    echo ""
}

main "$@"
