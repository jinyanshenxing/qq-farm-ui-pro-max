#!/usr/bin/env bash

set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9527}"
USERNAME="${SMOKE_USERNAME:-}"
PASSWORD="${SMOKE_PASSWORD:-}"
ADMIN_TOKEN="${SMOKE_ADMIN_TOKEN:-}"
TARGET_VERSION="${TARGET_VERSION:-}"
TARGET_SCOPE="${TARGET_SCOPE:-worker}"
TARGET_STRATEGY="${TARGET_STRATEGY:-rolling}"
TARGET_AGENT_IDS="${TARGET_AGENT_IDS:-}"
DEPLOY_DIR="${DEPLOY_DIR:-}"
SKIP_VERIFY_STACK="${SKIP_VERIFY_STACK:-0}"
REPORT_DIR="${REPORT_DIR:-}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-8}"
CURL_MAX_TIME="${CURL_MAX_TIME:-30}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_STACK_PATH="${SCRIPT_DIR}/verify-stack.sh"
TMP_DIR=""
COOKIE_JAR=""
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
PASS_LINES=()
WARN_LINES=()
FAIL_LINES=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cleanup() {
    if [ -n "${COOKIE_JAR}" ] && [ -f "${COOKIE_JAR}" ]; then
        rm -f "${COOKIE_JAR}"
    fi
    if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
        rm -rf "${TMP_DIR}"
    fi
}

trap cleanup EXIT

record_pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    PASS_LINES+=("$1")
    print_success "$1"
}

record_warn() {
    WARN_COUNT=$((WARN_COUNT + 1))
    WARN_LINES+=("$1")
    print_warning "$1"
}

record_fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAIL_LINES+=("$1")
    print_error "$1"
}

json_escape() {
    printf '%s' "$1" \
        | sed \
            -e 's/\\/\\\\/g' \
            -e 's/"/\\"/g' \
            -e ':a;N;$!ba;s/\n/\\n/g'
}

json_quote() {
    printf '"%s"' "$(json_escape "$1")"
}

csv_to_json_array() {
    node -e '
const input = String(process.argv[1] || "");
const values = input.split(",").map(item => item.trim()).filter(Boolean);
process.stdout.write(JSON.stringify(values));
' "$1"
}

json_get() {
    node -e '
const fs = require("node:fs");
const [filePath, queryPath, fallback] = process.argv.slice(1);
try {
  const text = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(text);
  const segments = String(queryPath || "").split(".").filter(Boolean);
  let current = data;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      current = undefined;
      break;
    }
    current = /^\d+$/.test(segment) ? current[Number(segment)] : current[segment];
  }
  if (current === undefined || current === null || current === "") {
    process.stdout.write(String(fallback || ""));
  } else if (typeof current === "object") {
    process.stdout.write(JSON.stringify(current));
  } else {
    process.stdout.write(String(current));
  }
} catch {
  process.stdout.write(String(fallback || ""));
}
' "$1" "$2" "${3:-}"
}

json_array_length() {
    node -e '
const fs = require("node:fs");
const [filePath, queryPath] = process.argv.slice(1);
try {
  const text = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(text);
  const segments = String(queryPath || "").split(".").filter(Boolean);
  let current = data;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      current = undefined;
      break;
    }
    current = /^\d+$/.test(segment) ? current[Number(segment)] : current[segment];
  }
  process.stdout.write(String(Array.isArray(current) ? current.length : 0));
} catch {
  process.stdout.write("0");
}
' "$1" "$2"
}

ensure_deps() {
    command -v curl >/dev/null 2>&1 || {
        print_error "当前环境缺少 curl。"
        exit 1
    }
    command -v node >/dev/null 2>&1 || {
        print_error "当前环境缺少 node。"
        exit 1
    }
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --base-url)
                BASE_URL="${2:-}"
                shift 2
                ;;
            --username)
                USERNAME="${2:-}"
                shift 2
                ;;
            --password)
                PASSWORD="${2:-}"
                shift 2
                ;;
            --token)
                ADMIN_TOKEN="${2:-}"
                shift 2
                ;;
            --target-version)
                TARGET_VERSION="${2:-}"
                shift 2
                ;;
            --scope)
                TARGET_SCOPE="${2:-worker}"
                shift 2
                ;;
            --strategy)
                TARGET_STRATEGY="${2:-rolling}"
                shift 2
                ;;
            --agent-ids)
                TARGET_AGENT_IDS="${2:-}"
                shift 2
                ;;
            --deploy-dir)
                DEPLOY_DIR="${2:-}"
                shift 2
                ;;
            --skip-verify-stack)
                SKIP_VERIFY_STACK=1
                shift
                ;;
            --report-dir)
                REPORT_DIR="${2:-}"
                shift 2
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
}

init_runtime_paths() {
    TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/system-update-smoke.XXXXXX")"
    COOKIE_JAR="${TMP_DIR}/auth.cookies"
    if [ -z "${REPORT_DIR}" ]; then
        REPORT_DIR="$(pwd)/reports/system-update-smoke/$(date +%Y%m%d_%H%M%S)"
    fi
    mkdir -p "${REPORT_DIR}"
}

api_request() {
    local method="$1"
    local api_path="$2"
    local body="${3:-}"
    local output_file="$4"
    local url="${BASE_URL%/}${api_path}"
    local curl_cmd=(
        curl
        -sS
        --connect-timeout "${CURL_CONNECT_TIMEOUT}"
        --max-time "${CURL_MAX_TIME}"
        -o "${output_file}"
        -w '%{http_code}'
        -X "${method}"
        "${url}"
        -H 'Accept: application/json'
    )

    if [ -n "${body}" ]; then
        curl_cmd+=(
            -H 'Content-Type: application/json'
            --data "${body}"
        )
    fi

    if [ -n "${ADMIN_TOKEN}" ]; then
        curl_cmd+=(-H "X-Admin-Token: ${ADMIN_TOKEN}")
    elif [ -f "${COOKIE_JAR}" ]; then
        curl_cmd+=(-b "${COOKIE_JAR}" -c "${COOKIE_JAR}")
    fi

    "${curl_cmd[@]}"
}

login_if_needed() {
    if [ -n "${ADMIN_TOKEN}" ]; then
        record_pass "已使用传入的 X-Admin-Token 执行 smoke。"
        return 0
    fi

    if [ -z "${USERNAME}" ] || [ -z "${PASSWORD}" ]; then
        record_fail "缺少认证信息；请传入 --token，或同时传入 --username / --password。"
        return 1
    fi

    local login_file="${REPORT_DIR}/00-login.json"
    local login_body
    local http_code
    login_body="{\"username\":$(json_quote "${USERNAME}"),\"password\":$(json_quote "${PASSWORD}")}"
    http_code="$(api_request "POST" "/api/login" "${login_body}" "${login_file}")" || {
        record_fail "调用 /api/login 失败，无法建立 smoke 会话。"
        return 1
    }

    if [ "${http_code}" != "200" ] || [ "$(json_get "${login_file}" "ok" "false")" != "true" ]; then
        record_fail "登录失败：HTTP ${http_code}，$(json_get "${login_file}" "error" "未知错误")"
        return 1
    fi

    record_pass "已通过 /api/login 建立管理员会话：$(json_get "${login_file}" "data.user.username" "-")"
}

run_validate_check() {
    local output_file="${REPORT_DIR}/01-auth-validate.json"
    local http_code
    http_code="$(api_request "GET" "/api/auth/validate" "" "${output_file}")" || {
        record_fail "认证验证接口 /api/auth/validate 调用失败。"
        return 1
    }
    if [ "${http_code}" != "200" ] || [ "$(json_get "${output_file}" "ok" "false")" != "true" ]; then
        record_fail "认证验证失败：HTTP ${http_code}，$(json_get "${output_file}" "error" "未知错误")"
        return 1
    fi
    record_pass "认证验证通过：$(json_get "${output_file}" "data.user.role" "-") / $(json_get "${output_file}" "data.user.username" "-")"
}

run_public_announcement_checks() {
    local notifications_file="${REPORT_DIR}/02-notifications.json"
    local announcements_file="${REPORT_DIR}/03-announcements.json"
    local http_code=""

    http_code="$(api_request "GET" "/api/notifications?limit=3" "" "${notifications_file}")" || true
    if [ "${http_code}" = "200" ] && [ "$(json_get "${notifications_file}" "ok" "false")" = "true" ]; then
        record_pass "公共通知接口可用：返回 $(json_array_length "${notifications_file}" "data") 条。"
    else
        record_fail "公共通知接口异常：HTTP ${http_code:-000}。"
    fi

    http_code="$(api_request "GET" "/api/announcement" "" "${announcements_file}")" || true
    if [ "${http_code}" = "200" ] && [ "$(json_get "${announcements_file}" "ok" "false")" = "true" ]; then
        record_pass "公告列表接口可用：返回 $(json_array_length "${announcements_file}" "data") 条。"
    else
        record_fail "公告列表接口异常：HTTP ${http_code:-000}。"
    fi
}

run_overview_and_check() {
    local overview_file="${REPORT_DIR}/04-system-update-overview.json"
    local check_file="${REPORT_DIR}/05-system-update-check.json"
    local sync_preview_file="${REPORT_DIR}/06-system-update-sync-dry-run.json"
    local preflight_file="${REPORT_DIR}/07-system-update-preflight.json"
    local http_code=""
    local sync_body=""
    local preflight_body=""
    local agent_json="[]"

    http_code="$(api_request "GET" "/api/admin/system-update/overview" "" "${overview_file}")" || true
    if [ "${http_code}" = "200" ] && [ "$(json_get "${overview_file}" "ok" "false")" = "true" ]; then
        record_pass "更新概览接口可用：当前 $(json_get "${overview_file}" "data.currentVersion" "-")，最新 $(json_get "${overview_file}" "data.latestRelease.versionTag" "-")。"
        if [ -z "${TARGET_VERSION}" ]; then
            TARGET_VERSION="$(json_get "${overview_file}" "data.latestRelease.versionTag" "")"
            if [ -z "${TARGET_VERSION}" ]; then
                TARGET_VERSION="$(json_get "${overview_file}" "data.latestVersion" "")"
            fi
        fi
    else
        record_fail "更新概览接口异常：HTTP ${http_code:-000}。"
    fi

    http_code="$(api_request "POST" "/api/admin/system-update/check" "{}" "${check_file}")" || true
    if [ "${http_code}" = "200" ] && [ "$(json_get "${check_file}" "ok" "false")" = "true" ]; then
        record_pass "检查更新接口可用：待同步公告 $(json_get "${check_file}" "data.syncRecommendation.pendingCount" "0") 条。"
    else
        record_fail "检查更新接口异常：HTTP ${http_code:-000}。"
    fi

    sync_body="{\"dryRun\":true,\"limit\":6"
    if [ -n "${TARGET_VERSION}" ]; then
        sync_body="${sync_body},\"markInstalled\":$(json_quote "${TARGET_VERSION}")"
    fi
    sync_body="${sync_body}}"
    http_code="$(api_request "POST" "/api/admin/system-update/sync-announcements" "${sync_body}" "${sync_preview_file}")" || true
    if [ "${http_code}" = "200" ] && [ "$(json_get "${sync_preview_file}" "ok" "false")" = "true" ]; then
        record_pass "公告 dry-run 预览可用：新增 $(json_get "${sync_preview_file}" "data.syncResult.added" "0")，更新 $(json_get "${sync_preview_file}" "data.syncResult.updated" "0")。"
    else
        record_fail "公告 dry-run 预览异常：HTTP ${http_code:-000}。"
    fi

    if [ -n "${TARGET_AGENT_IDS}" ]; then
        agent_json="$(csv_to_json_array "${TARGET_AGENT_IDS}")"
    fi
    preflight_body="{\"targetVersion\":$(json_quote "${TARGET_VERSION}"),\"scope\":$(json_quote "${TARGET_SCOPE}"),\"strategy\":$(json_quote "${TARGET_STRATEGY}"),\"targetAgentIds\":${agent_json},\"preflightOverride\":{}}"
    http_code="$(api_request "POST" "/api/admin/system-update/preflight" "${preflight_body}" "${preflight_file}")" || true
    if [ "${http_code}" = "200" ] && [ "$(json_get "${preflight_file}" "ok" "false")" = "true" ]; then
        if [ "$(json_get "${preflight_file}" "data.ok" "false")" = "true" ]; then
            record_pass "更新预检通过：提醒 $(json_get "${preflight_file}" "data.warningCount" "0") 项。"
        else
            record_warn "更新预检返回阻断：阻断 $(json_get "${preflight_file}" "data.blockerCount" "0") 项，提醒 $(json_get "${preflight_file}" "data.warningCount" "0") 项。"
        fi
    else
        record_fail "更新预检接口异常：HTTP ${http_code:-000}。"
    fi
}

run_jobs_checks() {
    local jobs_file="${REPORT_DIR}/08-system-update-jobs.json"
    local detail_file="${REPORT_DIR}/09-system-update-job-detail.json"
    local http_code=""
    local latest_job_id=""

    http_code="$(api_request "GET" "/api/admin/system-update/jobs?limit=20" "" "${jobs_file}")" || true
    if [ "${http_code}" != "200" ] || [ "$(json_get "${jobs_file}" "ok" "false")" != "true" ]; then
        record_fail "更新任务列表接口异常：HTTP ${http_code:-000}。"
        return 1
    fi

    record_pass "更新任务列表接口可用：返回 $(json_array_length "${jobs_file}" "data") 条。"
    latest_job_id="$(json_get "${jobs_file}" "data.0.id" "")"
    if [ -z "${latest_job_id}" ]; then
        record_warn "当前没有更新任务，任务详情与回滚候选检查已跳过。"
        return 0
    fi

    http_code="$(api_request "GET" "/api/admin/system-update/jobs/${latest_job_id}/logs?limit=30" "" "${detail_file}")" || true
    if [ "${http_code}" = "200" ] && [ "$(json_get "${detail_file}" "ok" "false")" = "true" ]; then
        local rollback_target=""
        rollback_target="$(json_get "${detail_file}" "data.rollbackPayload.previousVersion" "")"
        record_pass "任务详情接口可用：任务 $(json_get "${detail_file}" "data.job.jobKey" "-")，阶段 $(json_get "${detail_file}" "data.currentPhase" "-")。"
        if [ -n "${rollback_target}" ]; then
            record_pass "最近任务具备回滚候选：${rollback_target}"
        else
            record_warn "最近任务暂未暴露 previousVersion，可能尚无可回滚版本。"
        fi
    else
        record_fail "更新任务详情接口异常：HTTP ${http_code:-000}。"
    fi
}

run_verify_stack_if_needed() {
    local verify_log="${REPORT_DIR}/10-verify-stack.log"

    if [ "${SKIP_VERIFY_STACK}" = "1" ] || [ "${SKIP_VERIFY_STACK}" = "true" ]; then
        record_warn "已按参数跳过 verify-stack.sh。"
        return 0
    fi

    if [ ! -x "${VERIFY_STACK_PATH}" ]; then
        record_warn "未找到可执行的 verify-stack.sh，已跳过宿主机核验。"
        return 0
    fi

    if [ -z "${DEPLOY_DIR}" ]; then
        record_warn "未传入 --deploy-dir，已跳过宿主机 verify-stack 检查。"
        return 0
    fi

    if bash "${VERIFY_STACK_PATH}" --deploy-dir "${DEPLOY_DIR}" > "${verify_log}" 2>&1; then
        record_pass "宿主机 verify-stack.sh 通过。"
    else
        record_fail "宿主机 verify-stack.sh 失败，请查看 ${verify_log}"
    fi
}

write_summary() {
    local summary_file="${REPORT_DIR}/SUMMARY.md"
    {
        echo "# 系统更新中心 Smoke 报告"
        echo
        echo "- 检查时间：$(date '+%Y-%m-%d %H:%M:%S')"
        echo "- 基础地址：${BASE_URL}"
        echo "- 认证方式：$([ -n "${ADMIN_TOKEN}" ] && echo 'X-Admin-Token' || echo 'login cookie')"
        echo "- 目标版本：${TARGET_VERSION:-未解析}"
        echo "- 目标范围：${TARGET_SCOPE}"
        echo "- 目标策略：${TARGET_STRATEGY}"
        echo "- 目标代理：${TARGET_AGENT_IDS:-未指定}"
        echo "- 宿主机核验：$([ "${SKIP_VERIFY_STACK}" = "1" ] || [ "${SKIP_VERIFY_STACK}" = "true" ] && echo '已跳过' || echo "${DEPLOY_DIR:-未指定部署目录}")"
        echo
        echo "## 统计"
        echo
        echo "- 通过：${PASS_COUNT}"
        echo "- 提醒：${WARN_COUNT}"
        echo "- 失败：${FAIL_COUNT}"
        echo
        echo "## 通过项"
        echo
        if [ "${#PASS_LINES[@]}" -eq 0 ]; then
            echo "- 无"
        else
            for line in "${PASS_LINES[@]}"; do
                echo "- ${line}"
            done
        fi
        echo
        echo "## 提醒项"
        echo
        if [ "${#WARN_LINES[@]}" -eq 0 ]; then
            echo "- 无"
        else
            for line in "${WARN_LINES[@]}"; do
                echo "- ${line}"
            done
        fi
        echo
        echo "## 失败项"
        echo
        if [ "${#FAIL_LINES[@]}" -eq 0 ]; then
            echo "- 无"
        else
            for line in "${FAIL_LINES[@]}"; do
                echo "- ${line}"
            done
        fi
        echo
        echo "## 原始响应文件"
        echo
        for file in "${REPORT_DIR}"/*.json "${REPORT_DIR}"/*.log; do
            [ -e "${file}" ] || continue
            echo "- $(basename "${file}")"
        done
    } > "${summary_file}"
}

main() {
    parse_args "$@"
    ensure_deps
    init_runtime_paths

    print_info "输出目录：${REPORT_DIR}"
    print_info "基础地址：${BASE_URL}"

    login_if_needed || true
    run_validate_check || true
    run_public_announcement_checks || true
    run_overview_and_check || true
    run_jobs_checks || true
    run_verify_stack_if_needed || true
    write_summary

    if [ "${FAIL_COUNT}" -gt 0 ]; then
        print_error "Smoke 完成，但存在 ${FAIL_COUNT} 项失败。报告已写入 ${REPORT_DIR}/SUMMARY.md"
        exit 1
    fi

    if [ "${WARN_COUNT}" -gt 0 ]; then
        print_warning "Smoke 完成，无硬失败，但存在 ${WARN_COUNT} 项提醒。报告已写入 ${REPORT_DIR}/SUMMARY.md"
        exit 0
    fi

    print_success "Smoke 完成，所有检查通过。报告已写入 ${REPORT_DIR}/SUMMARY.md"
}

main "$@"
