#!/bin/sh
# Coturn on AWS EC2: use a minimal config file so no-tls/no-dtls are definitely applied
# (some releases still try TLS on 127.0.0.1:3478 when flags are only passed via a broken CLI chain).
#
# Only one turn server may bind 3478 on the host (network_mode: host).
set -e
TURN_REALM="${TURN_REALM:-api.growlitenepal.com}"
USERPAIR="${TURN_USERNAME}:${TURN_CREDENTIAL}"

CONF="$(mktemp)"
chmod 600 "$CONF"
# shellcheck disable=SC2064
trap 'rm -f "$CONF"' EXIT

{
  echo "listening-ip=0.0.0.0"
  echo "listening-port=3478"
  echo "realm=${TURN_REALM}"
  echo "user=${USERPAIR}"
  echo "min-port=49152"
  echo "max-port=65535"
  echo "no-tls"
  echo "no-dtls"
  echo "no-cli"
  echo "no-ipv6"
  echo "log-file=stdout"
} >"$CONF"

if [ -n "$TURN_EXTERNAL_IP" ] && [ -n "$TURN_PRIVATE_IP" ]; then
  echo "external-ip=${TURN_EXTERNAL_IP}/${TURN_PRIVATE_IP}" >>"$CONF"
elif [ -n "$TURN_EXTERNAL_IP" ]; then
  echo "external-ip=${TURN_EXTERNAL_IP}" >>"$CONF"
fi

exec turnserver -n -c "$CONF" "$@"
