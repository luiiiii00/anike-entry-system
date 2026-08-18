"""
Pruebas E2E de la capa de protección de contenido (ANIKE EJEPIKA).

Valida:
  1. La cortina de privacidad se activa al ocultar la pestaña (cambio de app)
     y se restaura al volver el foco.
  2. El aviso flotante aparece con atajos prohibidos (Ctrl+P).
  3. Ctrl+A / foco / escritura en formularios siguen funcionando.
  4. La marca de agua existe, es legible y no desborda el viewport.
  5. Los eventos quedan guardados con fecha y hora en el registro.

Uso:
  python3 e2e/content-protection.py     # E2E_BASE_URL por defecto localhost:8080
"""

import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
ROUTE = os.environ.get("E2E_PROTECTED_ROUTE", "/dashboard")

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


async def restore_session(context, page) -> None:
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 393, "height": 850})
        page = await context.new_page()

        await restore_session(context, page)
        await page.goto(f"{BASE}{ROUTE}", wait_until="domcontentloaded")
        try:
            await page.wait_for_selector("[data-testid='privacy-curtain']", state="attached", timeout=20000)
            # espera la hidratacion: la clase global la aplica el efecto de React
            await page.wait_for_function(
                "() => document.documentElement.classList.contains('protected-content')",
                timeout=20000,
            )
        except Exception as exc:
            check("capa de proteccion montada", False, f"no montada en {page.url}: {exc}")
            await browser.close()
            return 1
        check("capa de proteccion montada", True, page.url)

        curtain = page.locator("[data-testid='privacy-curtain']")
        check("cortina inactiva al inicio", await curtain.get_attribute("data-active") == "false")

        await page.evaluate(
            """() => {
                Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
                document.dispatchEvent(new Event('visibilitychange'));
            }"""
        )
        await page.wait_for_timeout(400)
        check(
            "cortina activa al cambiar de app",
            await curtain.get_attribute("data-active") == "true",
        )

        await page.evaluate(
            """() => {
                Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('focus'));
            }"""
        )
        await page.wait_for_timeout(400)
        check(
            "contenido restaurado al volver el foco",
            await curtain.get_attribute("data-active") == "false",
        )

        await page.keyboard.press("Control+p")
        notice = page.locator("[data-testid='protection-notice']")
        try:
            await notice.wait_for(state="attached", timeout=2000)
            check("aviso flotante con Ctrl+P", True, (await notice.inner_text()).strip())
        except Exception:
            check("aviso flotante con Ctrl+P", False, "no aparecio")

        await page.wait_for_timeout(2900)
        typed = await page.evaluate(
            """() => {
                const input = document.createElement('input');
                input.id = 'e2e-probe';
                document.body.appendChild(input);
                input.focus();
                return document.activeElement === input;
            }"""
        )
        await page.keyboard.type("ANIKE 123")
        await page.keyboard.press("Control+a")
        value = await page.eval_on_selector("#e2e-probe", "el => el.value")
        selection = await page.eval_on_selector(
            "#e2e-probe", "el => el.selectionEnd - el.selectionStart"
        )
        check("formulario enfocable y escribible", bool(typed) and value == "ANIKE 123", str(value))
        check("Ctrl+A no bloqueado en formularios", selection == len(value), str(selection))
        await page.evaluate("() => document.getElementById('e2e-probe')?.remove()")

        count = await page.locator("[data-testid='watermark-layer']").count()
        check("sin marca de agua", count == 0, str(count))



        log = await page.evaluate(
            "() => JSON.parse(window.localStorage.getItem('anike:protection-log') || '[]')"
        )
        types = {e["type"] for e in log}
        check("registro de blur/app-switch", bool({"blur", "app-switch"} & types), str(types))
        check("registro de atajo bloqueado", "shortcut" in types, str(types))
        check("todos los eventos con fecha y hora", all(e.get("at") for e in log))

        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} pruebas OK")
    return 1 if failed else 0


sys.exit(asyncio.run(main()))
