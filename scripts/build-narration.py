from __future__ import annotations

import asyncio
import json
import math
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path('demo-recording')
BUILD = ROOT / 'build'
BUILD.mkdir(parents=True, exist_ok=True)

TIMELINE = json.loads((ROOT / 'timeline.json').read_text(encoding='utf-8'))
VIDEO = ROOT / 'real-demo.webm'
VOICE = 'zh-CN-YunxiNeural'
RATE = '-4%'


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', str(path)
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


async def synthesize() -> list[Path]:
    clips: list[Path] = []
    for index, item in enumerate(TIMELINE):
        clip = BUILD / f'narration_{index:02d}.mp3'
        communicate = edge_tts.Communicate(item['text'], VOICE, rate=RATE)
        await communicate.save(str(clip))
        clips.append(clip)
    return clips


def srt_timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, rem = divmod(milliseconds, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f'{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}'


def write_subtitles(clips: list[Path], video_duration: float) -> None:
    lines: list[str] = []
    for index, (item, clip) in enumerate(zip(TIMELINE, clips), start=1):
        start = item['time_ms'] / 1000.0 + 0.15
        clip_duration = probe_duration(clip)
        next_start = (
            TIMELINE[index]['time_ms'] / 1000.0 - 0.35
            if index < len(TIMELINE)
            else video_duration - 0.5
        )
        end = min(start + clip_duration + 0.4, next_start, video_duration - 0.1)
        if end <= start:
            end = min(start + max(1.0, clip_duration), video_duration - 0.1)
        lines.extend([
            str(index),
            f'{srt_timestamp(start)} --> {srt_timestamp(end)}',
            item['text'],
            '',
        ])
    (BUILD / 'subtitles.srt').write_text('\n'.join(lines), encoding='utf-8-sig')


def build_audio(clips: list[Path], video_duration: float) -> None:
    command = ['ffmpeg', '-y']
    for clip in clips:
        command.extend(['-i', str(clip)])

    filters: list[str] = []
    labels: list[str] = []
    for index, item in enumerate(TIMELINE):
        delay = max(0, int(item['time_ms'] + 150))
        label = f'a{index}'
        filters.append(
            f'[{index}:a]aresample=48000,adelay={delay}|{delay},volume=1.0[{label}]'
        )
        labels.append(f'[{label}]')

    filters.append(
        ''.join(labels)
        + f'amix=inputs={len(labels)}:normalize=0:dropout_transition=0,'
          f'apad=whole_dur={video_duration:.3f}[mix]'
    )
    command.extend([
        '-filter_complex', ';'.join(filters),
        '-map', '[mix]',
        '-t', f'{video_duration:.3f}',
        '-c:a', 'pcm_s16le',
        str(BUILD / 'narration.wav'),
    ])
    run(*command)


def write_text_copy() -> None:
    text = '\n\n'.join(item['text'] for item in TIMELINE)
    (ROOT / 'narration.txt').write_text(text, encoding='utf-8-sig')


def main() -> None:
    clips = asyncio.run(synthesize())
    video_duration = probe_duration(VIDEO)
    write_subtitles(clips, video_duration)
    build_audio(clips, video_duration)
    write_text_copy()


if __name__ == '__main__':
    main()
