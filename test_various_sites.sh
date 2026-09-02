#!/bin/bash

# Mix aus verschiedenen Arten von Websites
urls=(
  # News/Aggregatoren
  "https://news.ycombinator.com"
  "https://reddit.com/r/programming"
  "https://slashdot.org"
  
  # Tech-Blogs
  "https://techcrunch.com"
  "https://arstechnica.com"
  "https://theverge.com"
  "https://wired.com"
  
  # Developer Resources
  "https://dev.to"
  "https://medium.com"
  "https://stackoverflow.com"
  
  # Personal Blogs/Content
  "https://daringfireball.net"
  "https://www.paulgraham.com"
  "https://xkcd.com"
  
  # Open Source Projects
  "https://www.kernel.org"
  "https://www.mozilla.org"
  "https://www.python.org"
  
  # Company Blogs
  "https://engineering.fb.com"
  "https://github.blog"
  "https://www.googleblog.com"
)

echo "Testing feedseeker on various sites..."
echo "======================================"
echo ""

found=0
not_found=0
failed=0

for url in "${urls[@]}"; do
  echo -n "Testing: $url ... "
  
  result=$(timeout 8 node /home/latz/coding/feed-seeker/dist/feedseeker-cli.cjs "$url" 2>&1)
  exit_code=$?
  
  if [ $exit_code -eq 124 ]; then
    echo "TIMEOUT"
    failed=$((failed + 1))
  elif echo "$result" | grep -oP 'https?://[^\s]+' | head -1 > /dev/null; then
    feed=$(echo "$result" | grep -oP 'https?://[^\s]+' | head -1)
    echo "✓ FOUND"
    echo "   → $feed"
    found=$((found + 1))
  else
    echo "✗ NO FEED"
    not_found=$((not_found + 1))
  fi
done

echo ""
echo "======================================"
echo "Results:"
echo "  Found feeds:   $found"
echo "  No feed:       $not_found"
echo "  Timeout/Error: $failed"
total=$((found + not_found + failed))
if [ $total -gt 0 ]; then
  echo "  Success rate:  $((found * 100 / total))%"
fi
