#!/usr/bin/env bash
set -euo pipefail

: "${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID, for example: export AWS_ACCOUNT_ID=123456789012}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL, for example: export ALERT_EMAIL=you@example.com}"

BUDGET_NAME="${BUDGET_NAME:-bek-avtotest-monthly-budget}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-5}"
CURRENCY="${CURRENCY:-USD}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/budget.json" <<JSON
{
  "BudgetName": "$BUDGET_NAME",
  "BudgetLimit": {
    "Amount": "$BUDGET_AMOUNT",
    "Unit": "$CURRENCY"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostTypes": {
    "IncludeTax": true,
    "IncludeSubscription": true,
    "UseBlended": false,
    "IncludeRefund": false,
    "IncludeCredit": false,
    "IncludeUpfront": true,
    "IncludeRecurring": true,
    "IncludeOtherSubscription": true,
    "IncludeSupport": true,
    "IncludeDiscount": true,
    "UseAmortized": false
  }
}
JSON

cat > "$TMP_DIR/notifications.json" <<JSON
[
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "$ALERT_EMAIL"
      }
    ]
  },
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "$ALERT_EMAIL"
      }
    ]
  }
]
JSON

aws budgets create-budget \
  --account-id "$AWS_ACCOUNT_ID" \
  --budget "file://$TMP_DIR/budget.json" \
  --notifications-with-subscribers "file://$TMP_DIR/notifications.json"

echo "Created AWS Budget '$BUDGET_NAME' for $BUDGET_AMOUNT $CURRENCY/month."
echo "Confirm the subscription from the email AWS sends to $ALERT_EMAIL."
