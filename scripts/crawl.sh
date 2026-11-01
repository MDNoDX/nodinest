#!/bin/bash
# Opens every signed-in page in all four languages and reports failures:
#   JAR=cookies.txt BASE=http://localhost:3100 bash scripts/crawl.sh
BASE=${BASE:-http://localhost:3100}
PAGES="/ /stats?tab=plans /plans /plans?tab=goals /plans?tab=plans /library /library?type=book /write /collections /notes /review /assistant /search?q=a /stats /suggestions /settings /settings?tab=premium /settings?tab=security /settings?tab=notifications /settings?tab=look /settings?tab=menu /settings?tab=keys /settings?tab=app /settings?tab=storage /settings?tab=privacy /settings?tab=help /premium /guide /notifications /media /media?kind=book /library/new /people /publishers /u/uicheck /u/uicheck/followers /u/uicheck/following /u/uicheck/items"
bad=0
for l in uz uz-Cyrl ru en; do
  for p in $PAGES; do
    out=$(curl -s -m 60 -L -b "$JAR" -H "Cookie: NEXT_LOCALE=$l" -b "NEXT_LOCALE=$l" -w '\n%{http_code}' "$BASE$p")
    code=${out##*$'\n'}
    if [ "$code" != 200 ] || echo "$out" | grep -qE 'MISSING_MESSAGE|__next_error__|data-dgst'; then
      echo "FAIL $l $p $code"; bad=$((bad+1))
    fi
  done
done
echo "done, failures: $bad"
