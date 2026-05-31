import os

def export_project_to_markdown(project_dir, output_file="project_code.md"):
    # المجلدات والملفات التي ترغب في تخطيها (يمكنك التعديل عليها)
    ignored_dirs = {'.git', '__pycache__', '.venv', 'venv', 'env', '.idea', '.vscode'}
    ignored_files = {output_file, '.DS_Store'}

    with open(output_file, 'w', encoding='utf-8') as md_file:
        md_file.write(f"# توثيق أكواد البرنامج\n")
        md_file.write(f"تم توليد هذا الملف تلقائياً لكل ملفات المشروع الموجودة في: `{os.path.abspath(project_dir)}`\n\n")
        md_file.write("---\n\n")

        # المرور على جميع المجلدات والملفات
        for root, dirs, files in os.walk(project_dir):
            # تصفية المجلدات لتجنب الدخول في المجلدات التي نريد تجاهلها
            dirs[:] = [d for d in dirs if d not in ignored_dirs]

            for file in files:
                if file in ignored_files:
                    continue

                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, project_dir)
                file_name, file_extension = os.path.splitext(file)
                
                # استخراج صيغة الملف بدون النقطة (مثلا py, js, html)
                lang = file_extension.replace('.', '').lower()

                try:
                    # قراءة محتوى الملف
                    with open(file_path, 'r', encoding='utf-8') as f:
                        code_content = f.read()

                    # كتابة البيانات في ملف Markdown بالشكل المطلوب
                    md_file.write(f"## اسم الملف: `{file}`\n")
                    md_file.write(f"* **صيغة الملف:** `{file_extension if file_extension else 'بدون صيغة'}`\n")
                    md_file.write(f"* **مسار الملف ومكانه:** `{relative_path}`\n\n")
                    md_file.write(f"### الكود كاملاً:\n")
                    
                    # فتح بلوك الكود الخاص بـ Markdown مع تحديد لغة البرمجة للتلوين التلقائي
                    md_file.write(f"```{lang}\n")
                    md_file.write(code_content)
                    md_file.write(f"\n```\n\n")
                    md_file.write("---\n\n")
                    
                    print(f"تم استخراج: {relative_path}")

                except Exception as e:
                    # في حال كان الملف ثنائياً (صورة مثلاً) أو حدث خطأ في الترميز يتم تخطيه
                    print(f"تم تخطي الملف (غير نصي أو خطأ في القراءة): {relative_path}")

    print(f"\n✅ اكتملت العملية! تم حفظ جميع الأكواد في الملف: {output_file}")

# تشغيل الكود على المجلد الحالي
if __name__ == "__main__":
    # نقطة (.) تعني المجلد الحالي الذي يتواجد فيه هذا السكربت
    # يمكنك وضع المسار الكامل للمشروع هنا إذا أردت تشغيله من مكان آخر
    current_directory = "." 
    export_project_to_markdown(current_directory)