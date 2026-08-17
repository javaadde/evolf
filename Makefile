src_file=evofox-phantom.py
exe_file=$(shell echo ${src_file} | cut -d . -f 1)
install_dir=/usr/local/bin

install: ${src_file}
	cp ./${src_file} ${install_dir}/${exe_file}

install-cli:
	pnpm install
	pnpm run build
	npm install -g --prefix $(HOME)/.local .

install-cli-npm:
	npm install
	npm run build
	npm install -g --prefix $(HOME)/.local .

uninstall:
	rm ${install_dir}/${exe_file}

uninstall-cli:
	npm uninstall -g --prefix $(HOME)/.local evofox-phantom-ink-cli
