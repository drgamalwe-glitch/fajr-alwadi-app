import os

def export_frontend_to_markdown(project_dir, output_file="frontend_code.md"):
    # المجلدات التي سيتم تخطيها بالكامل (تم إضافة مجلدات التجميع والباك اند والـ node_modules)
    ignored_dirs = {
        '.git', '__pycache__', '.venv', 'venv', 'env', '.idea', '.vscode',
        'node_modules', 'src-tauri', 'dist', 'out', 'build'
    }
    
    # الملفات التي ترغب في تخطيها
    ignored_files = {output_file, '.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'}
    
    # الامتدادات الخاصة بالفرونت اند فقط التي تريد استخراجها
    frontend_extensions = {'.tsx', '.ts', '.jsx', '.js', '.css', '.html', '.json'}

    with open(output_file, 'w', encoding='utf-8') as md_file:
        md_file.write(f"# توثيق أكواد الفرونت اند (React)\n")
        md_file.write(f"تم توليد هذا الملف تلقائياً لملفات الواجهة فقط في: `{os.path.abspath(project_dir)}`\n\n")
        md_file.write("---\n\n")

        # المرور على جميع المجلدات والملفات
        for root, dirs, files in os.walk(project_dir):
            # تصفية المجلدات لتجنب الدخول في المجلدات التي نريد تجاهلها (مثل src-tauri و node_modules)
            dirs[:] = [d for d in dirs if d not in ignored_dirs]

            for file in files:
                if file in ignored_files:
                    continue

                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, project_dir)
                _, file_extension = os.path.splitext(file)
                
                # التحقق من أن الملف ينتمي للفرونت اند فقط
                if file_extension.lower() not in frontend_extensions:
                    continue

                # استخراج صيغة الملف بدون النقطة لتلوين الكود
                lang = file_extension.replace('.', '').lower()
                # تصحيح التسمية لـ typescript لتظهر بشكل صحيح في الماركدوان
                if lang in ['tsx', 'ts']:
                    lang = 'typescript'

                try:
                    # قراءة محتوى الملف
                    with open(file_path, 'r', encoding='utf-8') as f:
                        code_content = f.read()

                    # كتابة البيانات في ملف Markdown
                    md_file.write(f"## اسم الملف: `{file}`\n")
                    md_file.write(f"* **صيغة الملف:** `{file_extension}`\n")
                    md_file.write(f"* **مسار الملف ومكانه:** `{relative_path}`\n\n")
                    md_file.write(f"### الكود كاملاً:\n")
                    
                    md_file.write(f"```{lang}\n")
                    md_file.write(code_content)
                    md_file.write(f"\n```\n\n")
                    md_file.write("---\n\n")
                    
                    print(f"تم استخراج: {relative_path}")

                except Exception as e:
                    print(f"تم تخطي الملف بسبب خطأ في القراءة: {relative_path}")

    print(f"\n✅ اكتملت العملية بنجاح! تم حفظ أكواد الفرونت اند في: {output_file}")

if __name__ == "__main__":
    # ضع السكربت في المجلد الرئيسي للمشروع (بجانب package.json) وشغله
    current_directory = "." 
    export_frontend_to_markdown(current_directory)