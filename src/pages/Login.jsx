import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Banner, Button, Input, Spin } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import icon from "../assets/icon_dark_64.png";
import { authApi } from "../api/auth";
import { AUTH_STATUS } from "../context/AuthContext";
import { useAuth, useThemedPage } from "../hooks";

export default function Login({ mode = "login" }) {
  useThemedPage();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, isAuthenticated, login, register } = useAuth();

  // Registration is open only while the instance has no accounts at all: the
  // first person to sign up claims it and becomes the administrator.
  const [setupRequired, setSetupRequired] = useState(null);
  useEffect(() => {
    let active = true;
    authApi
      .status()
      .then(({ setupRequired: required }) => {
        if (active) setSetupRequired(required);
      })
      .catch(() => {
        if (active) setSetupRequired(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const isRegister = mode === "register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from ?? "/editor";

  if (status === AUTH_STATUS.LOADING || setupRequired === null) {
    return (
      <div className="login-page h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;
  if (isRegister && !setupRequired) {
    return <Navigate to="/login" replace state={location.state} />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmation) {
      setError(t("passwords_do_not_match"));
      return;
    }
    setSubmitting(true);
    try {
      const credentials = {
        username: username.trim(),
        password,
        bootstrapSecret,
      };
      if (isRegister) await register(credentials);
      else await login(credentials);
      navigate(redirectTo, { replace: true });
    } catch (submitError) {
      setError(
        submitError.message ||
          t(isRegister ? "sign_up_failed" : "sign_in_failed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page h-screen flex items-center justify-center px-4">
      <div className="login-card w-full max-w-sm rounded-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <img src={icon} width={48} alt="drawDB" className="login-logo" />
          <h1 className="text-xl font-semibold mt-3">
            {t(isRegister ? "create_admin_account" : "sign_in")}
          </h1>
          <p className="login-hint text-sm mt-1 text-center">
            {t(isRegister ? "create_admin_subtitle" : "sign_in_subtitle")}
          </p>
        </div>

        {error && (
          <Banner
            type="danger"
            closeIcon={null}
            description={<span className="login-error">{error}</span>}
            className="mb-4"
          />
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          {isRegister && (
            <div>
              <label className="text-sm font-medium" htmlFor="bootstrap-secret">
                {t("bootstrap_secret")}
              </label>
              <Input
                id="bootstrap-secret"
                mode="password"
                value={bootstrapSecret}
                onChange={setBootstrapSecret}
                autoComplete="off"
                className="login-input mt-1"
              />
              <div className="login-hint text-xs mt-1">
                {t("bootstrap_secret_hint")}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium" htmlFor="username">
              {t("username")}
            </label>
            <Input
              id="username"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              autoFocus
              className="login-input mt-1"
            />
            {isRegister && (
              <div className="login-hint text-xs mt-1">
                {t("username_rules")}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="password">
              {t("password")}
            </label>
            <Input
              id="password"
              mode="password"
              value={password}
              onChange={setPassword}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="login-input mt-1"
            />
            {isRegister && (
              <div className="login-hint text-xs mt-1">
                {t("password_rules")}
              </div>
            )}
          </div>

          {isRegister && (
            <div>
              <label className="text-sm font-medium" htmlFor="confirmation">
                {t("confirm_password")}
              </label>
              <Input
                id="confirmation"
                mode="password"
                value={confirmation}
                onChange={setConfirmation}
                autoComplete="new-password"
                className="login-input mt-1"
              />
            </div>
          )}

          <Button
            htmlType="submit"
            theme="solid"
            size="large"
            block
            loading={submitting}
            disabled={
              !username.trim() || !password || (isRegister && !bootstrapSecret)
            }
          >
            {t(isRegister ? "create_admin_account" : "sign_in")}
          </Button>
        </form>

        <div className="login-hint text-sm text-center mt-5">
          {isRegister && (
            <>
              {t("have_account")}{" "}
              <Link
                to="/login"
                state={location.state}
                className="login-link font-medium"
              >
                {t("sign_in")}
              </Link>
            </>
          )}
          {!isRegister &&
            (setupRequired ? (
              <Link
                to="/register"
                state={location.state}
                className="login-link font-medium"
              >
                {t("set_up_instance")}
              </Link>
            ) : (
              t("registration_closed")
            ))}
        </div>
      </div>
    </div>
  );
}
