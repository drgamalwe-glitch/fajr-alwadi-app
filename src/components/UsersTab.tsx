import { useCallback, useEffect, useState } from "react";
import { callTauri } from "../api/tauri";

interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  profile_image?: string | null;
}

interface UsersTabProps {
  onLogout: () => void;
}

export function UsersTab({ onLogout }: UsersTabProps) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callTauri<UserInfo[]>("get_users");
      setUsers(data || []);
    } catch (err) {
      console.error("فشل تحميل المستخدمين:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const openNewForm = () => {
    setEditingUser(null);
    setFormUsername("");
    setFormPassword("");
    setFormDisplayName("");
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  };

  const openEditForm = (user: UserInfo) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormPassword("");
    setFormDisplayName(user.display_name);
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError("");
    setFormSuccess("");

    if (!formUsername.trim()) {
      setFormError("اسم المستخدم مطلوب");
      return;
    }
    if (formPassword.trim() && formPassword.trim().length < 3) {
      setFormError("كلمة المرور يجب أن تكون 3 أحرف على الأقل");
      return;
    }

    try {
      if (editingUser) {
        await callTauri("update_user", {
          id: editingUser.id,
          username: formUsername.trim(),
          displayName: formDisplayName.trim(),
          profileImage: editingUser.profile_image,
        });
        if (formPassword.trim()) {
          await callTauri("change_password", {
            id: editingUser.id,
            newPassword: formPassword.trim(),
          });
        }
        setFormSuccess("تم تحديث المستخدم");
      } else {
        if (!formPassword.trim()) {
          setFormError("كلمة المرور مطلوبة للمستخدم الجديد");
          return;
        }
        await callTauri("add_user", {
          username: formUsername.trim(),
          password: formPassword.trim(),
          displayName: formDisplayName.trim(),
          profileImage: null,
        });
        setFormSuccess("تم إنشاء المستخدم");
      }
      setShowForm(false);
      void loadUsers();
    } catch (err) {
      setFormError(String(err));
    }
  };

  const handleDelete = async (user: UserInfo) => {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${user.display_name}"؟`)) return;

    try {
      await callTauri("delete_user", { id: user.id });
      void loadUsers();
    } catch (err) {
      alert(String(err));
    }
  };

  return (
    <div className="users-tab">
      <div className="users-tab__header">
        <h2>إدارة المستخدمين</h2>
        <div className="users-tab__actions">
          <button className="btn btn--primary" onClick={openNewForm}>
            + مستخدم جديد
          </button>
          <button className="btn btn--secondary" onClick={onLogout}>
            تسجيل الخروج
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" aria-hidden />
          <p>جاري تحميل المستخدمين...</p>
        </div>
      ) : (
        <div className="users-tab__list">
          <div className="users-tab__grid header">
            <span>#</span>
            <span>اسم المستخدم</span>
            <span>الاسم المعروض</span>
            <span>الإجراءات</span>
          </div>
          {users.length === 0 ? (
            <div className="users-tab__empty">لا يوجد مستخدمون</div>
          ) : (
            users.map((user, idx) => (
              <div key={user.id} className="users-tab__grid row">
                <span>{idx + 1}</span>
                <span>{user.username}</span>
                <span>{user.display_name}</span>
                <span className="users-tab__row-actions">
                  <button className="btn btn--small" onClick={() => openEditForm(user)}>
                    تعديل
                  </button>
                  <button
                    className="btn btn--small btn--danger"
                    onClick={() => handleDelete(user)}
                    disabled={user.id === 1}
                  >
                    حذف
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingUser ? "تعديل مستخدم" : "مستخدم جديد"}</h3>
            <div className="form-field">
              <label>اسم المستخدم</label>
              <input
                type="text"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                dir="auto"
              />
            </div>
            <div className="form-field">
              <label>الاسم المعروض</label>
              <input
                type="text"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder="أدخل الاسم المعروض"
                dir="auto"
              />
            </div>
            <div className="form-field">
              <label>{editingUser ? "كلمة المرور الجديدة (اترك فارغاً لعدم التغيير)" : "كلمة المرور"}</label>
              <input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editingUser ? "اترك فارغاً لعدم التغيير" : "أدخل كلمة المرور"}
                dir="auto"
              />
            </div>
            {formError && <div className="form-error">{formError}</div>}
            {formSuccess && <div className="form-success">{formSuccess}</div>}
            <div className="form-actions">
              <button className="btn btn--primary" onClick={handleSave}>حفظ</button>
              <button className="btn btn--secondary" onClick={() => setShowForm(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
