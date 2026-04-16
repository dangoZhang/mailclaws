from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/zty/my-project/mailclaw")
SCREENSHOT_PATH = ROOT / "output" / "doc" / "workbench-rooms-list-light-actual.png"
ARTIFACT_PATH = ROOT / "output" / "benchmarks" / "three-provinces-room" / "artifacts" / "three-provinces-room.json"
OUTPUT_PATH = ROOT / "output" / "doc" / "results-three-provinces-communication.png"

FONT_CANDIDATES = [
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/Supplemental/Songti.ttc"),
]

LABELS = {
    "taizi": "太子",
    "zhongshu": "中书省",
    "menxia": "门下省",
    "shangshu": "尚书省",
    "libu-personnel": "吏部",
    "hubu": "户部",
    "bingbu": "兵部",
    "xingbu": "刑部",
    "libu-rites": "礼部",
    "gongbu": "工部",
}

CORE_SUMMARY = [
    ("太子", "立项：今夜前交付可颁行诏令"),
    ("中书省", "拆解任务包，明确六个政务维度"),
    ("门下省", "封驳后准奏，补齐官责与法度"),
    ("尚书省", "总领执行，把稳定任务包派给六部"),
    ("太子", "收束 final-ready，进入治理覆核"),
]

DEPARTMENT_ROWS = [
    ("吏部", "编制建议", "设督办大臣，州县逐级领责"),
    ("户部", "钱粮口径", "先开常平仓，数字一律标暂估"),
    ("兵部", "转运维稳", "水陆三路转运，不得借机扰民"),
    ("刑部", "法度边界", "可急调，不可越旨直接定重典"),
    ("礼部", "统稿成诏", "先安民，再施救，再写督责"),
    ("工部", "定稿装配", "整合次序与暂估说明，形成成品"),
]


def find_font_path() -> Path:
    for path in FONT_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError("No usable CJK font found.")


FONT_PATH = find_font_path()


def load_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size)


def shorten(text: str, limit: int) -> str:
    clean = " ".join(str(text).split())
    return clean if len(clean) <= limit else clean[: limit - 1] + "…"


def draw_text_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    body: str,
    *,
    fill: str,
    outline: str,
    title_fill: str = "#1d2733",
    body_fill: str = "#6b7785",
    badge_fill: str | None = None,
) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=22, fill=fill, outline=outline, width=2)
    if badge_fill is not None:
        draw.rounded_rectangle((x1 + 18, y1 + 16, x1 + 108, y1 + 46), radius=12, fill=badge_fill)
        draw.text((x1 + 63, y1 + 31), title, font=load_font(17), fill="#ffffff", anchor="mm")
    else:
        draw.text((x1 + 22, y1 + 34), title, font=load_font(24), fill=title_fill, anchor="ls")
    body_font = load_font(18)
    draw.text((x1 + 22, y1 + 68), shorten(body, 48), font=body_font, fill=body_fill, anchor="ls")


def draw_department_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    dept: str,
    title: str,
    body: str,
) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=22, fill="#fffaf9", outline="#efd7d2", width=2)
    draw.rounded_rectangle((x1 + 18, y1 + 14, x1 + 108, y1 + 44), radius=12, fill="#e68b73")
    draw.text((x1 + 63, y1 + 29), dept, font=load_font(17), fill="#ffffff", anchor="mm")
    draw.text((x1 + 126, y1 + 31), title, font=load_font(20), fill="#1d2733", anchor="ls")
    draw.text((x1 + 22, y1 + 66), shorten(body, 40), font=load_font(17), fill="#6b7785", anchor="ls")


def draw_down_arrow(draw: ImageDraw.ImageDraw, x: int, y1: int, y2: int, color: str) -> None:
    draw.line((x, y1, x, y2), fill=color, width=4)
    draw.polygon([(x, y2 + 10), (x - 8, y2 - 4), (x + 8, y2 - 4)], fill=color)


def draw_connector(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str) -> None:
    sx, sy = start
    ex, ey = end
    mid_x = sx + 110
    draw.line((sx, sy, mid_x, sy), fill=color, width=3)
    draw.line((mid_x, sy, mid_x, ey), fill=color, width=3)
    draw.line((mid_x, ey, ex - 16, ey), fill=color, width=3)
    draw.polygon([(ex, ey), (ex - 16, ey - 8), (ex - 16, ey + 8)], fill=color)


def main() -> None:
    artifact = json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))
    room = artifact["roomView"]
    scenario = artifact["scenario"]

    screenshot = Image.open(SCREENSHOT_PATH).convert("RGB")
    canvas_w, canvas_h = screenshot.size
    image = screenshot.copy()

    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((205, 120, 1245, 905), radius=28, fill="#fffdfc", outline="#e5d9d4", width=2)
    draw.rounded_rectangle((230, 145, 1218, 230), radius=22, fill="#fff8f6", outline="#eed8d3", width=2)

    title_font = load_font(34)
    subtitle_font = load_font(18)
    metric_label_font = load_font(16)
    metric_value_font = load_font(28)

    draw.text((255, 181), "三省六部通信链", font=title_font, fill="#1d2733", anchor="ls")
    draw.text(
        (255, 213),
        shorten(f"{scenario['title']} · 从真实 room artifact 与 demo 前端截图重绘", 54),
        font=subtitle_font,
        fill="#7f8b97",
        anchor="ls",
    )

    chip_specs = [
        ("前台", LABELS.get(str(room["frontAgentId"]), str(room["frontAgentId"]))),
        ("参与者", str(room["agentCount"])),
        ("消息", str(room["virtualMessageCount"])),
        ("投递", str(room["mailboxDeliveryCount"])),
    ]
    chip_x = 830
    for index, (label, value) in enumerate(chip_specs):
        x1 = chip_x + index * 100
        x2 = x1 + 92
        draw.rounded_rectangle((x1, 164, x2, 220), radius=16, fill="#ffffff", outline="#ead8d5", width=2)
        draw.text((x1 + 12, 183), label, font=metric_label_font, fill="#909ca8", anchor="ls")
        draw.text((x1 + 12, 208), value, font=load_font(22), fill="#1d2733", anchor="ls")

    draw.text(
        (255, 265),
        "结构说明：左侧是主责任链，右侧是尚书省向六部派案并收束回信的实际通信。",
        font=load_font(19),
        fill="#44505c",
        anchor="ls",
    )

    left_x1, left_x2 = 255, 500
    left_center_x = (left_x1 + left_x2) // 2
    core_ys = [315, 420, 525, 630, 805]
    core_fill = "#ffffff"
    accent_fill = "#e68b73"
    for index, ((title, body), y) in enumerate(zip(CORE_SUMMARY, core_ys)):
        box = (left_x1, y, left_x2, y + 80)
        draw_text_box(
            draw,
            box,
            title,
            body,
            fill=core_fill if index < 4 else "#f5fffc",
            outline="#e8d9d5",
            badge_fill=accent_fill if index != 4 else "#5eb5a8",
        )
        if index < len(core_ys) - 1:
            draw_down_arrow(draw, left_center_x, y + 80, core_ys[index + 1] - 16, "#c2b7b3")

    dept_x1, dept_x2 = 615, 1185
    dept_ys = [315, 400, 485, 570, 655, 740]
    for (dept, title, body), y in zip(DEPARTMENT_ROWS, dept_ys):
        box = (dept_x1, y, dept_x2, y + 72)
        draw_department_box(draw, box, dept, title, body)
        draw_connector(draw, (left_x2, 670), (dept_x1, y + 36), "#d0b6ae")

    draw.rounded_rectangle((255, 848, 1185, 878), radius=12, fill="#fff6f3", outline="#efd7d2")
    draw.text(
        (275, 867),
        "最终回收路径：六部回信 -> 尚书省总装 -> 太子 final-ready -> 治理覆核通过。",
        font=load_font(16),
        fill="#7a8591",
        anchor="ls",
    )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
