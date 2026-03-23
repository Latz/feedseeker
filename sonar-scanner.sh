#!/usr/bin/env bash
set -euo pipefail

SONAR_TOKEN="e612e8833ba0cfee91cff4abbb65826bc6c010a6"
PROJECT_KEY="Latz_feedseeker"
ORGANIZATION="latz-1"
OUTPUT_FILE="sonar-report.json"
DOWNLOAD=true

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --download) DOWNLOAD=true ;;
    --output=*) OUTPUT_FILE="${arg#--output=}" ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# Regenerate coverage before analysis
echo "Generating coverage report..."
pnpm run test:coverage

# Run analysis
echo "Running SonarCloud analysis..."
/usr/local/bin/sonar \
  -Dsonar.token="$SONAR_TOKEN" \
  -Dsonar.projectKey="$PROJECT_KEY" \
  -Dsonar.organization="$ORGANIZATION" \
  -Dsonar.qualitygate.wait=true

# Download report if requested
if [ "$DOWNLOAD" = true ]; then
  echo ""
  echo "Downloading report to $OUTPUT_FILE..."
  curl -s -u "${SONAR_TOKEN}:" \
    "https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false&ps=500&organization=${ORGANIZATION}" \
    -o "$OUTPUT_FILE"
  echo "Report saved to $OUTPUT_FILE"

  # Convert JSON report to Markdown
  MD_FILE="${OUTPUT_FILE%.json}.md"
  echo "Converting report to $MD_FILE..."

  TOTAL=$(jq '.total' "$OUTPUT_FILE")
  DATE=$(date '+%Y-%m-%d %H:%M')

  {
    echo "# SonarCloud Report — $PROJECT_KEY"
    echo "_Generated: $DATE — $TOTAL open issue(s)_"
    echo ""

    if [ "$TOTAL" -eq 0 ]; then
      echo "No open issues found."
    else
      echo "| Severity | Type | File | Line | Message | Effort |"
      echo "|----------|------|------|------|---------|--------|"
      jq -r '
        .issues[] |
        [
          .severity,
          .type,
          (.component | sub("^[^:]+:"; "")),
          (.textRange.startLine | tostring),
          .message,
          (.effort // "-")
        ] | @tsv
      ' "$OUTPUT_FILE" | while IFS=$'\t' read -r severity type file line message effort; do
        echo "| $severity | $type | \`$file\` | $line | $message | $effort |"
      done
    fi
  } > "$MD_FILE"

  echo "Markdown saved to $MD_FILE"
fi
