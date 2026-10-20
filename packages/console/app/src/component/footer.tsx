import { createAsync } from "@solidjs/router"
import { createMemo, Show } from "solid-js"
import { github } from "~/lib/github"
import { config } from "~/config"
import { useLanguage } from "~/context/language"
import { useI18n } from "~/context/i18n"

export function Footer() {
  const language = useLanguage()
  const i18n = useI18n()
  const community = createMemo(() => {
    const locale = language.locale()
    return locale === "zh" || locale === "zht"
      ? ({ key: "footer.feishu", link: language.route("/feishu") } as const)
      : null
  })
  const githubData = createAsync(() => github())
  const starCount = createMemo(() =>
    githubData()?.stars
      ? new Intl.NumberFormat(language.tag(language.locale()), {
          notation: "compact",
          compactDisplay: "short",
        }).format(githubData()!.stars!)
      : config.github.starsFormatted.compact,
  )

  return (
    <footer data-component="footer">
      <div data-slot="cell">
        <a href={config.github.repoUrl} target="_blank">
          {i18n.t("footer.github")} <span>[{starCount()}]</span>
        </a>
      </div>
      <div data-slot="cell">
        <a href={language.route("/docs")}>{i18n.t("footer.docs")}</a>
      </div>
      <div data-slot="cell">
        <a href={language.route("/changelog")}>{i18n.t("footer.changelog")}</a>
      </div>
      <Show when={community()}>
        {(c) => (
          <div data-slot="cell">
            <a href={c().link}>{i18n.t(c().key)}</a>
          </div>
        )}
      </Show>
      <div data-slot="cell">
        <a href={config.social.twitter}>{i18n.t("footer.x")}</a>
      </div>
    </footer>
  )
}
