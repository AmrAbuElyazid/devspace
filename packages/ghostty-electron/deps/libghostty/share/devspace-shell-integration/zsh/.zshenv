# Devspace shell integration bootstrap for zsh.
# This file is sourced when ZDOTDIR points to this directory (set per-surface
# via ghostty_surface_config_s.env_vars). It restores the user's real ZDOTDIR,
# sources their dotfiles, then loads Ghostty's shell integration for CWD
# tracking (OSC 7), prompt marking (OSC 133), and other features.

# Restore the original ZDOTDIR immediately.
if [[ -n "${DEVSPACE_ORIG_ZDOTDIR+X}" ]]; then
    'builtin' 'export' ZDOTDIR="$DEVSPACE_ORIG_ZDOTDIR"
    'builtin' 'unset' 'DEVSPACE_ORIG_ZDOTDIR'
else
    'builtin' 'unset' 'ZDOTDIR'
fi

{
    # Source the user's real .zshenv (zsh treats unset ZDOTDIR as HOME).
    'builtin' 'typeset' _devspace_file=${ZDOTDIR-$HOME}"/.zshenv"
    [[ ! -r "$_devspace_file" ]] || 'builtin' 'source' '--' "$_devspace_file"
} always {
    if [[ -o 'interactive' ]]; then
        # Source Ghostty's shell integration if available.
        # This provides OSC 7 (CWD reporting), OSC 133 (prompt marking),
        # cursor shape changes, and other terminal features.
        if [[ -n "${GHOSTTY_RESOURCES_DIR:-}" ]]; then
            'builtin' 'typeset' _devspace_ghostty="${GHOSTTY_RESOURCES_DIR}/shell-integration/zsh/ghostty-integration"
            if [[ -r "$_devspace_ghostty" ]]; then
                'builtin' 'autoload' '-Uz' '--' "$_devspace_ghostty"
                "${_devspace_ghostty:t}"
                'builtin' 'unfunction' '--' "${_devspace_ghostty:t}" 2>/dev/null
            fi
            'builtin' 'unset' '_devspace_ghostty'
        fi
    fi
    'builtin' 'unset' '_devspace_file'
}
