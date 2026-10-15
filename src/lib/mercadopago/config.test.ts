import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedLiveMode, pixExpirationMinutes, PIX_MIN_EXPIRATION_MINUTES, PIX_MAX_EXPIRATION_MINUTES } from "./config.ts";

test("vencimento do Pix nunca fica abaixo do mínimo da API (30 min)", () => {
  process.env.MERCADOPAGO_PIX_EXPIRATION_MINUTES = "15";
  assert.equal(pixExpirationMinutes(), PIX_MIN_EXPIRATION_MINUTES);
  process.env.MERCADOPAGO_PIX_EXPIRATION_MINUTES = "abc";
  assert.equal(pixExpirationMinutes(), PIX_MIN_EXPIRATION_MINUTES);
});

test("vencimento do Pix nunca passa do máximo (30 dias)", () => {
  process.env.MERCADOPAGO_PIX_EXPIRATION_MINUTES = "999999";
  assert.equal(pixExpirationMinutes(), PIX_MAX_EXPIRATION_MINUTES);
});

test("valor dentro da faixa é respeitado", () => {
  process.env.MERCADOPAGO_PIX_EXPIRATION_MINUTES = "45";
  assert.equal(pixExpirationMinutes(), 45);
});

test("ambiente esperado sai do prefixo do access token", () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-xxx";
  assert.equal(expectedLiveMode(), true);
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-xxx";
  assert.equal(expectedLiveMode(), false);
});
