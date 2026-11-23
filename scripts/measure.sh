#!/bin/zsh
# Measures the running Release app on a booted iOS simulator while intensity animates:
#  - CPU time the app process uses in 20 s
#  - a 10 s `sample` of the process, then the main-thread samples spent under BlurEffectView
# Usage: scripts/measure.sh <label>
set -e
LABEL=${1:-run}
PID=$(pgrep -f 'expobluranimatedintensityrepro.app/expobluranimatedintensityrepro' | head -1)
[ -z "$PID" ] && { echo "App is not running"; exit 1; }
cpu() { ps -o time= -p $PID | awk -F'[:.]' '{print ($1*60+$2)+("0."$3)}'; }
a=$(cpu); sleep 20; b=$(cpu)
echo "$LABEL: app CPU in 20 s = $(echo "$b - $a" | bc) s ($(echo "scale=1; ($b - $a)*5" | bc)% of one core)"
OUT=sample-$LABEL.txt
sample $PID 10 -mayDie -file $OUT >/dev/null 2>&1
python3 - "$OUT" <<'PY'
import re, sys
lines = open(sys.argv[1]).read().splitlines()
def top(key):
    best = 0
    for l in lines:
        if key in l:
            n = re.findall(r'\s(\d+)\s', l)
            if n: best = max(best, int(n[0]))
    return best
main = next((l for l in lines if 'com.apple.main-thread' in l), '')
m = re.search(r'(\d+) Thread', main)
print(f"  main-thread samples (1 ms each): {m.group(1) if m else '?'}")
for key in ['BlurEffectView', '-[UIViewPropertyAnimator startAnimationAsPaused:]',
            '-[UIViewPropertyAnimator _previousAnimatorForKeyPath:inLayer:compoundKeys:]']:
    print(f"  samples under {key}: {top(key)}")
print(f"  full call tree: {sys.argv[1]}")
PY
