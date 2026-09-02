#!/bin/bash

# Additional categories: news outlets, media, blogs, e-commerce, dev communities
urls=(
  # Major News Outlets
  "https://www.bbc.com"
  "https://www.cnn.com"
  "https://www.nytimes.com"
  "https://www.theguardian.com"
  "https://www.reuters.com"
  
  # Tech News / Reviews
  "https://www.engadget.com"
  "https://www.tomshardware.com"
  "https://www.anandtech.com"
  "https://www.pcgamer.com"
  "https://www.digitaltrends.com"
  
  # Independent Blogs / Substack
  "https://www.joelonsoftware.com"
  "https://www.marginalrevolution.com"
  "https://www.schneier.com"
  "https://stratechery.com"
  "https://www.ribbonfarm.com"
  
  # Science / Academic
  "https://arxiv.org"
  "https://sciencedaily.com"
  "https://phys.org"
  "https://news.ycombinator.com"
  
  # Podcasts / Video Platforms
  "https://www.youtube.com"
  "https://www.twitch.tv"
  
  # E-Commerce
  "https://www.amazon.com"
  "https://www.ebay.com"
  
  # Dev Communities
  "https://www.hackernews.io"
  "https://news.ycombinator.com"
  "https://www.producthunt.com"
  "https://www.indiehackers.com"
  
  # Specific Tech Sites
  "https://www.smashingmagazine.com"
  "https://css-tricks.com"
  "https://www.freecodecamp.org"
  "https://www.udemy.com"
  "https://www.coursera.org"
)

echo "Testing feedseeker on additional site categories..."
echo "===================================================="
echo ""

found=0
not_found=0
timeout_count=0

declare -A category_results
declare -A category_found
declare -A category_total

for url in "${urls[@]}"; do
  # Extract category from URL
  if [[ $url =~ news|cnn|bbc|reuters|guardian|nytimes ]]; then
    category="News Outlets"
  elif [[ $url =~ engadget|tomshardware|anandtech|pcgamer|digitaltrends ]]; then
    category="Tech Reviews"
  elif [[ $url =~ joel|marginal|schneier|stratechery|ribbon ]]; then
    category="Independent Blogs"
  elif [[ $url =~ arxiv|sciencedaily|phys ]]; then
    category="Science/Academic"
  elif [[ $url =~ youtube|twitch ]]; then
    category="Video Platforms"
  elif [[ $url =~ amazon|ebay ]]; then
    category="E-Commerce"
  elif [[ $url =~ hacker|product|indie ]]; then
    category="Dev Communities"
  elif [[ $url =~ smashing|css-tricks|freecode|udemy|coursera ]]; then
    category="Learning Platforms"
  else
    category="Other"
  fi
  
  category_total[$category]=$((${category_total[$category]:-0} + 1))
  
  echo -n "Testing: $url ... "
  
  result=$(timeout 8 node /home/latz/coding/feed-seeker/dist/feedseeker-cli.cjs "$url" 2>&1)
  exit_code=$?
  
  if [ $exit_code -eq 124 ]; then
    echo "TIMEOUT"
    timeout_count=$((timeout_count + 1))
  elif echo "$result" | grep -qoP 'https?://[^\s]+'; then
    feed=$(echo "$result" | grep -oP 'https?://[^\s]+' | head -1)
    echo "✓ FOUND"
    echo "   → $feed"
    found=$((found + 1))
    category_found[$category]=$((${category_found[$category]:-0} + 1))
  else
    echo "✗ NO FEED"
    not_found=$((not_found + 1))
  fi
done

echo ""
echo "===================================================="
echo "Overall Results:"
echo "  Found feeds:   $found"
echo "  No feed:       $not_found"
echo "  Timeout/Error: $timeout_count"
total=$((found + not_found + timeout_count))
if [ $total -gt 0 ]; then
  echo "  Success rate:  $((found * 100 / total))%"
fi

echo ""
echo "Results by Category:"
for category in "News Outlets" "Tech Reviews" "Independent Blogs" "Science/Academic" "Video Platforms" "E-Commerce" "Dev Communities" "Learning Platforms" "Other"; do
  total_cat=${category_total[$category]:-0}
  found_cat=${category_found[$category]:-0}
  if [ $total_cat -gt 0 ]; then
    rate=$((found_cat * 100 / total_cat))
    echo "  $category: $found_cat/$total_cat ($rate%)"
  fi
done
