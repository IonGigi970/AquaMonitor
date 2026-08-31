# Template-uri de email în română (Supabase)

Configurează-le în **Supabase Dashboard → Authentication → Email Templates**.
Copiază textul de mai jos în fiecare câmp corespunzător.

---

## 1. Confirmare email (Confirm signup)

**Subject:**
```
Confirmă-ți adresa de email — AquaMonitor CT
```

**Body (HTML):**
```html
<h2>Bine ai venit la AquaMonitor CT! 💧</h2>
<p>Salut,</p>
<p>Îți mulțumim că te-ai înregistrat la AquaMonitor CT — serviciul care te ține la curent cu avariile de apă din Constanța și împrejurimi.</p>
<p>Pentru a-ți activa contul, apasă pe butonul de mai jos:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirmă contul</a></p>
<p>Dacă butonul nu funcționează, copiază și lipește acest link în browser:</p>
<p><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>
<p>Dacă nu ai creat tu un cont, poți ignora acest email.</p>
<p>— Echipa AquaMonitor CT</p>
```

---

## 2. Resetare parolă (Reset password)

**Subject:**
```
Resetează-ți parola — AquaMonitor CT
```

**Body (HTML):**
```html
<h2>Resetare parolă</h2>
<p>Salut,</p>
<p>Am primit o cerere de resetare a parolei pentru contul tău de AquaMonitor CT.</p>
<p>Apasă pe butonul de mai jos pentru a-ți seta o parolă nouă:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Resetează parola</a></p>
<p>Dacă butonul nu funcționează, copiază și lipește acest link în browser:</p>
<p><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>
<p>Dacă nu ai cerut tu resetarea parolei, poți ignora acest email.</p>
<p>— Echipa AquaMonitor CT</p>
```

---

## 3. Schimbare email (Email change)

**Subject:**
```
Confirmă noua adresă de email — AquaMonitor CT
```

**Body (HTML):**
```html
<h2>Schimbare adresă de email</h2>
<p>Salut,</p>
<p>Ai cerut să-ți schimbi adresa de email pe AquaMonitor CT.</p>
<p>Apasă pe butonul de mai jos pentru a confirma noua adresă:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirmă noua adresă</a></p>
<p>— Echipa AquaMonitor CT</p>
```

---

## 4. Invitație (Invite user)

**Subject:**
```
Ai fost invitat la AquaMonitor CT
```

**Body (HTML):**
```html
<h2>Invitație</h2>
<p>Salut,</p>
<p>Ai fost invitat să te alături AquaMonitor CT.</p>
<p>Apasă pe butonul de mai jos pentru a-ți crea contul:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Acceptă invitația</a></p>
<p>— Echipa AquaMonitor CT</p>
```

---

## 5. Magic link (Magic link)

**Subject:**
```
Autentificare — AquaMonitor CT
```

**Body (HTML):**
```html
<h2>Autentificare</h2>
<p>Salut,</p>
<p>Apasă pe butonul de mai jos pentru a te autentifica:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Autentifică-te</a></p>
<p>— Echipa AquaMonitor CT</p>
```

---

## Notă importantă

- **Sender name** (în tab-ul "Sender"): setează-l pe `AquaMonitor CT` ca emailurile să pară de la aplicație.
- **Site URL** și **Redirect URLs** trebuie să fie deja setate la `https://aquamonitorct.vercel.app` (le-ai configurat deja).
