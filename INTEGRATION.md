# Vatar integration notes

Vatar is not integrated in the staging build. Do not add an SDK, credentials, player identity flow, match lifecycle, payments, wagers, or result submission until the owner provides official sandbox documentation and credentials.

The current staging match flow uses the Cloudflare Worker and Durable Objects only. Its opaque participant tokens are temporary and must be replaced—not extended—when the documented Vatar identity/session flow becomes available.
