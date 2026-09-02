import streamlit as st
from github_client import create_github_release, upload_release_asset, GitHubClientError

def main():
    st.set_page_config(
        page_title="Windows Service Fleet Manager - Publisher",
        page_icon="🚀",
        layout="centered"
    )

    st.title("🚀 Publisher de Releases de Serviços Windows")
    st.markdown(
        "Esta interface permite publicar novos artefatos binários (`.zip`) no GitHub, "
        "gerando Releases formais para atualização remota da frota de agentes."
    )

    st.sidebar.header("🔑 Autenticação GitHub")
    github_token = st.sidebar.text_input(
        "GitHub Access Token",
        type="password",
        help="Informe um Personal Access Token (PAT) com permissão de escrita em Repositories/Releases."
    )

    with st.form("release_form"):
        st.subheader("📦 Dados da Release")

        repo_option = st.selectbox(
            "Serviço Alvo / Repositório GitHub",
            options=[
                "sua-org/ConfigMonitorSVC",
                "sua-org/FileTransferSVC",
                "Outro (digitar manualmente)"
            ]
        )

        if repo_option == "Outro (digitar manualmente)":
            repo_name = st.text_input("Repositório (Formato: owner/repository)", placeholder="ex: minha-empresa/MeuServico")
        else:
            repo_name = repo_option

        tag_version = st.text_input(
            "Tag / Versão da Release",
            placeholder="ex: v2.4.1 ou 1.0.0.16",
            help="Tag semântica da versão."
        )

        release_title = st.text_input(
            "Título da Release",
            placeholder="ex: Release v2.4.1 - Correções WCF e Performance"
        )

        changelog = st.text_area(
            "Notas da Versão / Changelog",
            height=150,
            placeholder="Descreva aqui as alterações, novas funcionalidades ou correções incluídas nesta versão..."
        )

        uploaded_file = st.file_uploader(
            "Arquivo Binário (.zip)",
            type=["zip"],
            help="Selecione o arquivo .zip compilado contendo o executável e arquivos .config."
        )

        submit_button = st.form_submit_button("🚀 Publicar Release no GitHub")

    if submit_button:
        if not github_token:
            st.error("❌ Por favor, informe o GitHub Access Token no painel lateral.")
            return

        if not repo_name or "/" not in repo_name:
            st.error("❌ Repositório inválido. Especifique no formato `proprietario/repositorio`.")
            return

        if not tag_version:
            st.error("❌ Por favor, informe a Tag / Versão da Release.")
            return

        if not uploaded_file:
            st.error("❌ Por favor, selecione um arquivo `.zip` para upload.")
            return

        owner, repo = repo_name.strip().split("/", 1)
        file_bytes = uploaded_file.getvalue()
        filename = uploaded_file.name

        progress_bar = st.progress(0, text="Iniciando processo de publicação...")

        try:
            progress_bar.progress(25, text="1/3 Criando Release formal no GitHub...")
            release_data = create_github_release(
                owner=owner,
                repo=repo,
                tag_name=tag_version.strip(),
                name=release_title.strip() if release_title else tag_version.strip(),
                body=changelog.strip(),
                token=github_token.strip()
            )

            upload_url = release_data.get("upload_url", "")
            release_html_url = release_data.get("html_url", "")

            progress_bar.progress(65, text=f"2/3 Enviando artefato `{filename}`...")
            asset_data = upload_release_asset(
                upload_url=upload_url,
                file_bytes=file_bytes,
                filename=filename,
                token=github_token.strip()
            )

            progress_bar.progress(100, text="3/3 Publicação concluída com sucesso!")
            st.success(f"✅ Release `{tag_version}` criada com sucesso!")
            st.markdown(f"🔗 **Link da Release:** [{release_html_url}]({release_html_url})")
            st.json({
                "release_id": release_data.get("id"),
                "tag": release_data.get("tag_name"),
                "asset_name": asset_data.get("name"),
                "size_bytes": asset_data.get("size")
            })

        except GitHubClientError as e:
            progress_bar.empty()
            st.error(f"❌ Erro na integração com GitHub: {e}")
        except Exception as e:
            progress_bar.empty()
            st.error(f"❌ Ocorreu um erro inesperado: {e}")

if __name__ == "__main__":
    main()
