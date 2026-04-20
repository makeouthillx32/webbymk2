# DNS Records On GoDaddy

a @ 15.197.225.128
a @ 3.33.251.168
a *.cool 173.24.124.104

ns @ ns53.domaincontrol.com.
ns @ ns54.domaincontrol.com.

cname * unenter.asuscomm.com.
cname brevo1._domainkey b1.unenter-live.dkim.brevo.com.
cname brevo2._domainkey b2.unenter-live.dkim.brevo.com.
cname db.mc unenter.asuscomm.com.
cname love unenter.asuscomm.com.
cname mail unenter.asuscomm.com.
cname mc unenter.asuscomm.com.
cname npm unenter.asuscomm.com.
cname power unenter.asuscomm.com.
cname www unenter.asuscomm.com.

soa @ ns53.domaincontrol.com.

mx @ mail.unenter.live. (10)

txt @ brevo-code:3fecd41fe10238d9695ea503e930a1ae
txt @ v=spf1 mx a include:asuscomm.com ~all
txt s20260131297._domainkey.mail k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzPnjSkxJTc0V8TZRAFOkEPpwNjtTjKm0iPbLHwNLrMDfsWho3am3AFr0AGGmNVZQi9Z/7pRwxzSb+Nfx1wKa39j2uZo9e3QW1s0jTXGHprxPY1f3r5ii42+oOBW0yeBPkHbpA/If+jY1o8ovBdN6xbfnrU8SJ8vJB6ECoEjOrfhDmUAHv4Q2oCaQoW0+pnzl9UHwIi62ASs1rO+NXU4gpisfDk/gfPqdxAGYQaO5ZlexmxA2T3FBCGfNgDr1ErQwcUy5Hban+nMdH/ZfBLzeGg4ct5NhfPC1PxH++eryEvEVFT+zqtAVCXv5XQsoq+ujar4hKBqIcILSTfpq0sjavwIDAQAB
txt _dmarc v=DMARC1; p=none; rua=mailto:admin@mail.unenter.live; ruf=mailto:admin@mail.unenter.live; fo=1

# Reverse Proxies all running from L0VE pc L0V3 192.168.50.75 on npm is using Manual IP Binding for a prod network npm is using ports jc21/nginx-proxy-manager:latest 443:443 80:80 81:81

*.cool.unenter.live → [http://192.168.50.75:9080](http://192.168.50.75:9080)
accounting.unenter.live → [http://192.168.50.204:5007](http://192.168.50.204:5007)
ai.unenter.live → [http://192.168.50.75:3010](http://192.168.50.75:3010)
aud.unenter.live → [http://192.168.50.204:3000](http://192.168.50.204:3000)
cal.unenter.live → [http://192.168.50.178:8594](http://192.168.50.178:8594)
cool.unenter.live → [http://192.168.50.75:9080](http://192.168.50.75:9080)
db.mc.unenter.live → [http://192.168.50.204:8000](http://192.168.50.204:8000)
db.unenter.live → [http://192.168.50.204:8001](http://192.168.50.204:8001)
gateway.mc.unenter.live → [http://192.168.50.204:18789](http://192.168.50.204:18789)
linuxhelp.unenter.live → [http://192.168.50.204:18088](http://192.168.50.204:18088)
love-models.local → [http://host.docker.internal:12434](http://host.docker.internal:12434)
mail.unenter.live → [http://192.168.50.75:8082](http://192.168.50.75:8082)
mc.unenter.live → [http://192.168.50.204:5012](http://192.168.50.204:5012)
n8n.unenter.live → [http://192.168.50.204:5678](http://192.168.50.204:5678)
npm.unenter.live → [http://192.168.50.75:81](http://192.168.50.75:81)
port.unenter.live → [http://192.168.50.204:9000](http://192.168.50.204:9000)
pw.unenter.live → [https://http://192.168.50.178:8088](https://http://192.168.50.178:8088)
retro.unenter.live → [http://192.168.50.204:3050](http://192.168.50.204:3050)
supa.unenter.live → [http://192.168.50.75:8000](http://192.168.50.75:8000)
supabase.local → [http://supabase-kong:8000](http://supabase-kong:8000)
val.unenter.live → [http://192.168.50.178:4000](http://192.168.50.178:4000)
vault.unenter.live → [http://192.168.50.178:9001](http://192.168.50.178:9001)
windmill.unenter.live → [http://192.168.50.178:8080](http://192.168.50.178:8080)
[www.unenter.live](http://www.unenter.live) → [http://192.168.50.204:3000](http://192.168.50.204:3000)

# GT-BE98 Pro Port Forwards and configs


NPM-HTTPS 443 → 192.168.50.75:443 TCP
NPM-http 80 → 192.168.50.75:80 TCP
FTP Server 20,21 → 192.168.50.204:21 TCP
n8n 5678 → 192.168.50.204 BOTH
cool 8002 → 192.168.50.75:8002 BOTH
portainer 9000,9100 → 192.168.50.204 TCP
Power-ssh 2222 → 192.168.50.204:22 TCP
sshschool 18088 → 192.168.50.48:8080 TCP
Power-RDP 3390 → 192.168.50.204:3389 TCP
Love-RDP 3391 → 192.168.50.75:3389 TCP
Love-ssh 2223 → 192.168.50.75:22 TCP
SMTP 25 → 192.168.50.75 TCP
SMTP submission 587 → 192.168.50.75 TCP
IMAPS 993 → 192.168.50.75 TCP
Sieve 4190 → 192.168.50.75 TCP
tml 7777 → 192.168.50.204 TCP
mission-control 5012 → 192.168.50.204 TCP
Missioncontrol-db 8000 → 192.168.50.204 TCP
unenter.live 3000 → 192.168.50.204 TCP
db.unenter.live 8081 → 192.168.50.204 BOTH

# ocal Access Config