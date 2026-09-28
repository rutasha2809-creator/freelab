from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter


W, H = 900, 1200
ASSETS = Path(r"C:\Users\rutas\.cursor\projects\c-Users-rutas-OneDrive-FREELAB\assets")
OUT = Path(r"C:\Users\rutas\OneDrive\Документы\Profi Ru\Карточки товара Андрей\Готовая карточка WB")

LINE = "0,5 мм"

INK = "#2A1F3D"
PURPLE = "#6E46B8"
PINK = "#EE4C88"
WHITE = "#FFFFFF"
MUTED = "#6F6780"

FONT_REG = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"
FONT_BLACK = r"C:\Windows\Fonts\ariblk.ttf"


def font(size, weight="bold"):
    path = {"regular": FONT_REG, "bold": FONT_BOLD, "black": FONT_BLACK}[weight]
    if not Path(path).exists():
        path = FONT_BOLD
    return ImageFont.truetype(path, size)


def scene(name):
    img = Image.open(ASSETS / name).convert("RGB")
    ratio = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * ratio), round(img.height * ratio)), Image.Resampling.LANCZOS)
    x, y = (img.width - W) // 2, (img.height - H) // 2
    return img.crop((x, y, x + W, y + H)).convert("RGBA")


def text_w(draw, text, fnt):
    b = draw.textbbox((0, 0), text, font=fnt)
    return b[2] - b[0]


def centered(draw, text, y, fnt, fill=INK):
    draw.text(((W - text_w(draw, text, fnt)) / 2, y), text, font=fnt, fill=fill)


def shadow_box(img, box, radius, fill, blur=18, alpha=45):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        (box[0] + 6, box[1] + 12, box[2] + 6, box[3] + 12), radius, fill=(40, 20, 70, alpha))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rounded_rectangle(box, radius, fill=fill)
    img.alpha_composite(overlay)


def pill(draw, x, y, text, fill, color=WHITE, size=30):
    fnt = font(size)
    b = draw.textbbox((0, 0), text, font=fnt)
    w, h = b[2] - b[0] + 44, size + 30
    draw.rounded_rectangle((x, y, x + w, y + h), h // 2, fill=fill)
    draw.text((x + 22, y + (h - (b[3] - b[1])) / 2 - b[1]), text, font=fnt, fill=color)
    return w


def pills_centered(draw, y, items, size=28, gap=14):
    fnt = font(size)
    widths = [text_w(draw, t, fnt) + 44 for t, _ in items]
    x = (W - sum(widths) - gap * (len(items) - 1)) / 2
    for (t, c), w in zip(items, widths):
        pill(draw, x, y, t, c, size=size)
        x += w + gap


def check(draw, x, y, color):
    draw.ellipse((x, y, x + 40, y + 40), fill=color)
    draw.line((x + 11, y + 21, x + 18, y + 28), fill=WHITE, width=5)
    draw.line((x + 18, y + 28, x + 30, y + 12), fill=WHITE, width=5)


def save(img, n, slug):
    img.convert("RGB").save(OUT / f"{n:02d}_{slug}.jpg", quality=95, subsampling=0, optimize=True)


def slide_1():
    img = scene("scene-01-hero.png")
    d = ImageDraw.Draw(img)
    centered(d, "ГЕЛЕВЫЕ РУЧКИ", 70, font(78, "black"), WHITE)
    centered(d, "НАБОР 12 ЦВЕТОВ", 170, font(52, "black"), INK)
    pills_centered(d, 262, [("игольчатый наконечник", PINK), (LINE, PURPLE)], size=30)
    shadow_box(img, (640, 330, 850, 490), 36, WHITE)
    d = ImageDraw.Draw(img)
    for text, y, fnt, color in (("12", 338, font(92, "black"), PINK), ("ШТУК", 446, font(28), INK)):
        d.text((745 - text_w(d, text, fnt) / 2, y), text, font=fnt, fill=color)
    save(img, 1, "главное")


def slide_2():
    img = scene("scene-02-palette-v2.png")
    shadow_box(img, (50, 40, 850, 290), 40, (255, 255, 255, 240))
    d = ImageDraw.Draw(img)
    centered(d, "12 НАСЫЩЕННЫХ", 70, font(62, "black"), INK)
    centered(d, "ЦВЕТОВ", 146, font(62, "black"), PINK)
    centered(d, "от классического чёрного до сочного розового", 230, font(27, "regular"), MUTED)
    save(img, 2, "палитра")


def slide_3():
    img = scene("scene-03-tip.png")
    d = ImageDraw.Draw(img)
    d.text((60, 70), "ИГОЛЬЧАТЫЙ", font=font(66, "black"), fill=INK)
    d.text((60, 148), "НАКОНЕЧНИК", font=font(66, "black"), fill=INK)
    pill(d, 60, 244, LINE, PINK, size=40)
    shadow_box(img, (60, 830, 840, 1140), 36, (255, 255, 255, 235))
    d = ImageDraw.Draw(img)
    items = [("Плавное письмо", "без усилий и нажима"),
             ("Ровная тонкая линия", "аккуратно даже в мелких деталях"),
             ("Гелевые чернила", "на водной основе")]
    for i, (title, sub) in enumerate(items):
        y = 862 + i * 90
        check(d, 92, y + 6, PURPLE if i != 1 else PINK)
        d.text((152, y), title, font=font(32), fill=INK)
        d.text((152, y + 42), sub, font=font(25, "regular"), fill=MUTED)
    save(img, 3, "наконечник")


def slide_4():
    img = scene("scene-04-study.png")
    d = ImageDraw.Draw(img)
    centered(d, "ДЛЯ УЧЁБЫ", 60, font(70, "black"), INK)
    centered(d, "И РАБОТЫ", 142, font(70, "black"), PURPLE)
    pills_centered(d, 250, [("конспекты", PURPLE), ("планер", PINK), ("заметки", "#1F9E8F")], size=30)
    centered(d, "Выделяйте главное цветом — так запоминается легче", 338, font(26, "regular"), MUTED)
    save(img, 4, "учеба")


def slide_5():
    img = scene("scene-05-creative.png")
    d = ImageDraw.Draw(img)
    centered(d, "РИСУЙТЕ", 50, font(76, "black"), PINK)
    centered(d, "ЯРКО", 136, font(76, "black"), INK)
    centered(d, "скетчи  •  открытки  •  раскраски  •  леттеринг", 240, font(28, "regular"), MUTED)
    save(img, 5, "творчество")


def slide_6():
    img = scene("scene-06-gift.png")
    d = ImageDraw.Draw(img)
    centered(d, "ИДЕАЛЬНЫЙ", 60, font(74, "black"), WHITE)
    centered(d, "ПОДАРОК", 146, font(74, "black"), INK)
    centered(d, "ребёнку, который любит рисовать", 252, font(32), PURPLE)
    save(img, 6, "подарок")


def slide_7():
    img = Image.new("RGBA", (W, H), "#F4EEFF")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 330), fill="#3A2A5C")
    centered(d, "ХАРАКТЕРИСТИКИ", 60, font(62, "black"), WHITE)
    centered(d, "всё, что важно знать перед покупкой", 150, font(28, "regular"), "#D9CCF2")

    pack = Image.open(ASSETS / "pens-exact-12-packshot.png").convert("RGB")
    pack = pack.crop((0, 150, pack.width, 840))
    pw = 560
    pack = pack.resize((pw, round(pack.height * pw / pack.width)), Image.Resampling.LANCZOS)
    box = (170, 210, 170 + pw + 0, 210 + pack.height)
    shadow_box(img, (box[0] - 16, box[1] - 16, box[2] + 16, box[3] + 16), 30, WHITE)
    mask = Image.new("L", pack.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *pack.size), 22, fill=255)
    img.paste(pack, box[:2], mask)

    rows = [("Тип", "гелевые ручки"),
            ("Количество", "12 шт. / 12 цветов"),
            ("Наконечник", f"игольчатый, {LINE}"),
            ("Чернила", "гелевые, на водной основе"),
            ("Колпачок", "прозрачный"),
            ("Назначение", "учёба, работа, творчество")]
    top = box[3] + 50
    shadow_box(img, (60, top, 840, top + 60 * len(rows) + 30), 32, WHITE)
    d = ImageDraw.Draw(img)
    for i, (k, v) in enumerate(rows):
        y = top + 22 + i * 60
        if i:
            d.line((96, y - 10, 804, y - 10), fill="#EEE8F7", width=2)
        d.text((96, y), k, font=font(28, "regular"), fill=MUTED)
        d.text((804 - text_w(d, v, font(28)), y), v, font=font(28), fill=INK)
    save(img, 7, "характеристики")


LISTING = f"""НАЗВАНИЕ (до 60 символов)
Ручки гелевые цветные набор 12 шт, игольчатые {LINE}

ОПИСАНИЕ
Яркий набор из 12 гелевых ручек — для учёбы, работы и творчества в одной упаковке.

Игольчатый наконечник {LINE} оставляет тонкую, чёткую и ровную линию. Ручка скользит по бумаге легко и плавно, без нажима, поэтому рука не устаёт даже при долгих записях. Гелевые чернила на водной основе дают насыщенный цвет, который хорошо виден в тетради, блокноте и на открытке.

В наборе 12 цветов: от классических чёрного и синего до сочных розового, оранжевого, бирюзового и зелёного. Прозрачный колпачок позволяет сразу увидеть нужный оттенок.

Для чего подойдут:
— конспекты и школьные тетради: выделяйте заголовки, формулы и важные мысли;
— ежедневник, планер и bullet journal;
— рабочие заметки, схемы и списки дел;
— рисунки, скетчи, раскраски, открытки и леттеринг.

Отличный подарок ребёнку, который любит рисовать, школьнику к 1 сентября, студенту или коллеге. Порадует и взрослых, и детей.

ХАРАКТЕРИСТИКИ
Тип: ручки гелевые
Количество в наборе: 12 шт.
Количество цветов: 12
Тип наконечника: игольчатый
Толщина линии: {LINE}
Чернила: гелевые, на водной основе
Колпачок: прозрачный
Назначение: учёба, работа, творчество, рисование

КЛЮЧЕВЫЕ СЛОВА
ручки гелевые цветные; набор гелевых ручек; ручки для рисования; цветные ручки для школы; ручки 12 цветов; игольчатые ручки; ручки для конспектов; ручки для скетчинга; канцелярия для школы; подарок ребенку
"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()
    for fn in (slide_1, slide_2, slide_3, slide_4, slide_5, slide_6, slide_7):
        fn()
    (OUT / "Текст для карточки WB.txt").write_text(LISTING, encoding="utf-8")
    print("done")


if __name__ == "__main__":
    main()
