#!/bin/sh
# Install local Git hooks that enforce the branch workflow.
# Run once after cloning: sh scripts/install-hooks.sh

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/bin/sh
# Prevent direct pushes to master or dev.
# All changes must go through a feature branch → PR workflow.

protected="master dev"
current=$(git branch --show-current)

for branch in $protected; do
  if [ "$current" = "$branch" ]; then
    echo ""
    echo "  ERROR: direct push to '$branch' is not allowed."
    echo "  Use /ship <feature-name> to open a PR instead."
    echo ""
    exit 1
  fi
done

exit 0
EOF

chmod +x "$HOOKS_DIR/pre-push"
echo "Git hooks installed."
