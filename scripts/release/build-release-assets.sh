#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_ROOT}/release-assets}"
VERSION_INPUT="${VERSION_INPUT:-}"
SKIP_PACKAGE_RELEASE=0
SKIP_OFFLINE_BUNDLES=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "缺少命令: $1"
        exit 1
    fi
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --version)
                VERSION_INPUT="${2:-}"
                shift 2
                ;;
            --output-dir)
                OUTPUT_DIR="${2:-}"
                shift 2
                ;;
            --skip-package-release)
                SKIP_PACKAGE_RELEASE=1
                shift
                ;;
            --skip-offline-bundles)
                SKIP_OFFLINE_BUNDLES=1
                shift
                ;;
            *)
                if [ -z "${VERSION_INPUT}" ]; then
                    VERSION_INPUT="$1"
                    shift
                else
                    print_error "未知参数: $1"
                    exit 1
                fi
                ;;
        esac
    done
}

resolve_version() {
    local raw_version="${VERSION_INPUT:-}"

    if [ -z "${raw_version}" ]; then
        require_cmd node
        raw_version="$(node -p "require('${PROJECT_ROOT}/core/package.json').version")"
    fi

    RELEASE_VERSION="${raw_version#v}"
    RELEASE_TAG="v${RELEASE_VERSION}"
}

build_release_binaries() {
    if [ "${SKIP_PACKAGE_RELEASE}" = "1" ]; then
        print_warning "跳过 pnpm package:release，复用现有 core/dist 产物。"
        return 0
    fi

    require_cmd pnpm
    print_info "构建多平台二进制产物..."
    (
        cd "${PROJECT_ROOT}"
        pnpm package:release
    )
}

assert_binary_exists() {
    local path="$1"
    if [ ! -f "${path}" ]; then
        print_error "缺少二进制产物: ${path}"
        exit 1
    fi
}

prepare_output_dir() {
    mkdir -p "${OUTPUT_DIR}"
    rm -f \
        "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-windows-x64.zip" \
        "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-linux-x64.tar.gz" \
        "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-macos-x64.tar.gz" \
        "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-macos-arm64.tar.gz" \
        "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-deploy.tar.gz" \
        "${OUTPUT_DIR}/SHA256SUMS.txt"
}

package_binary_archives() {
    local dist_dir="${PROJECT_ROOT}/core/dist"

    require_cmd zip
    require_cmd tar

    assert_binary_exists "${dist_dir}/qq-farm-bot-win-x64.exe"
    assert_binary_exists "${dist_dir}/qq-farm-bot-linux-x64"
    assert_binary_exists "${dist_dir}/qq-farm-bot-macos-x64"
    assert_binary_exists "${dist_dir}/qq-farm-bot-macos-arm64"

    print_info "打包 Release 二进制压缩包..."
    zip -j "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-windows-x64.zip" "${dist_dir}/qq-farm-bot-win-x64.exe" >/dev/null
    tar -C "${dist_dir}" -czf "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-linux-x64.tar.gz" qq-farm-bot-linux-x64
    tar -C "${dist_dir}" -czf "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-macos-x64.tar.gz" qq-farm-bot-macos-x64
    tar -C "${dist_dir}" -czf "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-macos-arm64.tar.gz" qq-farm-bot-macos-arm64
}

create_versioned_deploy_bundle() {
    local tmp_dir=""
    local bundle_dir=""

    require_cmd cp
    require_cmd mktemp

    tmp_dir="$(mktemp -d)"
    bundle_dir="${tmp_dir}/qq-farm-deploy"

    mkdir -p "${bundle_dir}/init-db"
    mkdir -p "${bundle_dir}/logs/development"
    cp "${PROJECT_ROOT}/deploy/docker-compose.yml" "${bundle_dir}/docker-compose.yml"
    cp "${PROJECT_ROOT}/deploy/.env.example" "${bundle_dir}/.env.example"
    cp "${PROJECT_ROOT}/deploy/README.md" "${bundle_dir}/README.md"
    cp "${PROJECT_ROOT}/CHANGELOG.md" "${bundle_dir}/CHANGELOG.md"
    cp "${PROJECT_ROOT}/deploy/init-db/01-init.sql" "${bundle_dir}/init-db/01-init.sql"
    cp "${PROJECT_ROOT}/scripts/deploy/fresh-install.sh" "${bundle_dir}/fresh-install.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/install-or-update.sh" "${bundle_dir}/install-or-update.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/safe-update.sh" "${bundle_dir}/safe-update.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/update-agent.sh" "${bundle_dir}/update-agent.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/install-update-agent-service.sh" "${bundle_dir}/install-update-agent-service.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/manual-config-wizard.sh" "${bundle_dir}/manual-config-wizard.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/stack-layout.sh" "${bundle_dir}/stack-layout.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/verify-stack.sh" "${bundle_dir}/verify-stack.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/smoke-system-update-center.sh" "${bundle_dir}/smoke-system-update-center.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/repair-mysql.sh" "${bundle_dir}/repair-mysql.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/repair-deploy.sh" "${bundle_dir}/repair-deploy.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/update-app.sh" "${bundle_dir}/update-app.sh"
    cp "${PROJECT_ROOT}/scripts/deploy/quick-deploy.sh" "${bundle_dir}/quick-deploy.sh"
    if [ -f "${PROJECT_ROOT}/logs/development/Update.log" ]; then
        cp "${PROJECT_ROOT}/logs/development/Update.log" "${bundle_dir}/logs/development/Update.log"
    fi

    tar -C "${tmp_dir}" -czf "${OUTPUT_DIR}/qq-farm-bot-${RELEASE_TAG}-deploy.tar.gz" qq-farm-deploy
    rm -rf "${tmp_dir}"
}

export_offline_bundles() {
    if [ "${SKIP_OFFLINE_BUNDLES}" = "1" ]; then
        print_warning "跳过离线镜像包导出。"
        return 0
    fi

    print_info "导出离线部署包..."
    (
        cd "${PROJECT_ROOT}"
        bash deploy/scripts/export-offline-packages.sh "${RELEASE_TAG}" --output-dir "${OUTPUT_DIR}"
    )
}

write_checksums() {
    local checksum_cmd=()
    local files=(
        "qq-farm-bot-${RELEASE_TAG}-windows-x64.zip"
        "qq-farm-bot-${RELEASE_TAG}-linux-x64.tar.gz"
        "qq-farm-bot-${RELEASE_TAG}-macos-x64.tar.gz"
        "qq-farm-bot-${RELEASE_TAG}-macos-arm64.tar.gz"
        "qq-farm-bot-${RELEASE_TAG}-deploy.tar.gz"
    )

    if command -v sha256sum >/dev/null 2>&1; then
        checksum_cmd=(sha256sum)
    elif command -v shasum >/dev/null 2>&1; then
        checksum_cmd=(shasum -a 256)
    else
        print_warning "未检测到 sha256sum/shasum，跳过校验文件输出。"
        return 0
    fi

    if [ "${SKIP_OFFLINE_BUNDLES}" != "1" ]; then
        files+=(
            "qq-farm-bot-deploy.tar.gz"
            "qq-farm-bot-images-amd64.tar.gz"
            "qq-farm-bot-images-arm64.tar.gz"
            "qq-farm-bot-${RELEASE_TAG}-offline-amd64.tar.gz"
            "qq-farm-bot-${RELEASE_TAG}-offline-arm64.tar.gz"
        )
    fi

    (
        cd "${OUTPUT_DIR}"
        "${checksum_cmd[@]}" "${files[@]}" > SHA256SUMS.txt
    )
}

show_summary() {
    echo ""
    print_success "Release 产物已输出。"
    echo "版本: ${RELEASE_TAG}"
    echo "输出目录: ${OUTPUT_DIR}"
    echo "  - qq-farm-bot-${RELEASE_TAG}-windows-x64.zip"
    echo "  - qq-farm-bot-${RELEASE_TAG}-linux-x64.tar.gz"
    echo "  - qq-farm-bot-${RELEASE_TAG}-macos-x64.tar.gz"
    echo "  - qq-farm-bot-${RELEASE_TAG}-macos-arm64.tar.gz"
    echo "  - qq-farm-bot-${RELEASE_TAG}-deploy.tar.gz"
    if [ "${SKIP_OFFLINE_BUNDLES}" != "1" ]; then
        echo "  - qq-farm-bot-deploy.tar.gz"
        echo "  - qq-farm-bot-images-amd64.tar.gz"
        echo "  - qq-farm-bot-images-arm64.tar.gz"
        echo "  - qq-farm-bot-${RELEASE_TAG}-offline-amd64.tar.gz"
        echo "  - qq-farm-bot-${RELEASE_TAG}-offline-arm64.tar.gz"
    fi
    if [ -f "${OUTPUT_DIR}/SHA256SUMS.txt" ]; then
        echo "  - SHA256SUMS.txt"
    fi
}

main() {
    parse_args "$@"
    resolve_version
    prepare_output_dir
    build_release_binaries
    package_binary_archives
    create_versioned_deploy_bundle
    export_offline_bundles
    write_checksums
    show_summary
}

main "$@"
