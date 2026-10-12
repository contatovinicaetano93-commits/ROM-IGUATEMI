# ROM Iguatemi — app nativo (Capacitor)

Shell iOS/Android que abre a intranet em produção:

**https://rom-iguatemi.vercel.app**

Bundle id: `com.rom.iguatemi`  
App name: **ROM Iguatemi**

Não usa static export do Next.js. Login, cookies (`rom_session`) e APIs ficam no host Vercel.

## Setup

```bash
cd mobile
npm install
npx cap sync
```

### Android (Linux/Mac)

```bash
npx cap add android   # só na 1ª vez, se a pasta android/ não existir
npx cap open android
```

### iOS (somente Mac + Xcode)

```bash
npx cap add ios
npx cap open ios
```

## Contas / lojas

Mesmo processo do app Brasil, com nome/bundle Iguatemi:

| Loja | Bundle / nome |
|------|----------------|
| Google Play | `com.rom.iguatemi` / ROM Iguatemi |
| App Store | `com.rom.iguatemi` / ROM Iguatemi |

Checklist completo: ver também `rom_brasil/mobile/README.md` (ícones, privacy, AAB, TestFlight).

## Paridade

Shell do Brasil: `rom_brasil/mobile` (`com.rom.brasil` → `https://rom-club.vercel.app`).
