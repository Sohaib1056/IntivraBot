import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Bell, Globe, Lock, Trash2, User, Building2, Download } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { cn } from '../../lib/cn'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

function Toggle({ on, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50',
        on ? 'bg-brand-600' : 'bg-ink-200'
      )}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

function Row({ icon: Icon, title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-start gap-3">
        {Icon && <Icon className="mt-0.5 h-4 w-4 text-ink-400" />}
        <div>
          <div className="text-sm font-medium text-ink-900">{title}</div>
          {desc && <div className="text-xs text-ink-500">{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user, setUser, logout } = useAuth()

  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [company, setCompany] = useState(user?.company || '')
  const [savingAccount, setSavingAccount] = useState(false)

  const [savingPref, setSavingPref] = useState(false)

  // HR hiring defaults. Collected once in onboarding; this is the only place
  // they can be changed afterwards.
  const h = user?.hiring || {}
  const [hiring, setHiring] = useState({
    industry: h.industry || 'IT / Software',
    size: h.size || '11-50',
    designation: h.designation || 'HR Manager',
    departments: h.departments || '',
    applyThreshold: h.applyThreshold ?? 70,
    passThreshold: h.passThreshold ?? 80,
    language: h.language || 'English',
    questionsPerInterview: h.questionsPerInterview ?? 5,
  })
  const [savingHiring, setSavingHiring] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [exporting, setExporting] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (!user) {
    return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  }

  const isHr = user.role === 'hr'
  const settings = user.settings || {}

  const saveAccount = async () => {
    if (name.trim().length < 2) return toast.error('Please enter your full name.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error('Enter a valid email address.')
    if (isHr && company.trim().length < 2) return toast.error('Please enter your company name.')

    setSavingAccount(true)
    try {
      const res = await api.patch('/auth/me', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        ...(isHr ? { company: company.trim() } : {}),
      })
      setUser(res.user)
      toast.success('Account updated.')
    } catch (err) {
      toast.error(err.message || 'Could not save your account')
    } finally {
      setSavingAccount(false)
    }
  }

  // Preference changes save immediately — no separate button to forget.
  const savePref = async (patch) => {
    setSavingPref(true)
    try {
      const res = await api.patch('/auth/me', { settings: patch })
      setUser(res.user)
    } catch (err) {
      toast.error(err.message || 'Could not save your preference')
    } finally {
      setSavingPref(false)
    }
  }

  const saveHiring = async () => {
    if (Number(hiring.passThreshold) < Number(hiring.applyThreshold)) {
      return toast.error('Pass threshold must be greater than or equal to the apply threshold.')
    }
    setSavingHiring(true)
    try {
      const res = await api.patch('/auth/me', {
        hiring: {
          ...hiring,
          departments: hiring.departments.trim(),
          applyThreshold: Number(hiring.applyThreshold),
          passThreshold: Number(hiring.passThreshold),
          questionsPerInterview: Number(hiring.questionsPerInterview),
        },
      })
      setUser(res.user)
      toast.success('Hiring defaults saved.')
    } catch (err) {
      toast.error(err.message || 'Could not save your hiring defaults')
    } finally {
      setSavingHiring(false)
    }
  }

  const changePassword = async () => {
    if (!currentPassword) return toast.error('Enter your current password.')
    if (newPassword.length < 8) return toast.error('New password must be at least 8 characters.')

    setSavingPassword(true)
    try {
      await api.patch('/auth/password', { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      toast.success('Password updated.')
    } catch (err) {
      toast.error(err.message || 'Could not update your password')
    } finally {
      setSavingPassword(false)
    }
  }

  const exportData = async () => {
    setExporting(true)
    try {
      const data = await api.get('/auth/me/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `intivrabot-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Your data has been downloaded.')
    } catch (err) {
      toast.error(err.message || 'Could not export your data')
    } finally {
      setExporting(false)
    }
  }

  const deleteAccount = async () => {
    if (!deletePassword) return toast.error('Enter your password to confirm.')
    setDeleting(true)
    try {
      await api.del('/auth/me', { body: { password: deletePassword } })
      toast.success('Your account has been deleted.')
      logout()
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Could not delete your account')
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-xl font-bold text-ink-900">Settings</h2>

      {/* Two columns on desktop so the page fills the width like every other
          dashboard screen; a single stack below lg. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
      {/* Account */}
      <Card>
        <CardHeader title="Account" subtitle="Your sign-in details" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {isHr && (
            <Input
              label="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              hint="Your team, invites and job postings are grouped under this name."
            />
          )}
          <Button size="sm" onClick={saveAccount} disabled={savingAccount}>
            {savingAccount ? <><Spinner size={16} /> Saving…</> : 'Save changes'}
          </Button>
        </CardBody>
      </Card>

      {/* HR hiring defaults — the only place these can be changed after the
          onboarding wizard has been completed. */}
      {isHr && (
        <Card>
          <CardHeader
            title="Hiring defaults"
            subtitle="Pre-filled on every new job you post — each job can still override them"
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Industry"
                value={hiring.industry}
                onChange={(e) => setHiring((s) => ({ ...s, industry: e.target.value }))}
              >
                <option>IT / Software</option>
                <option>Marketing</option>
                <option>Finance</option>
                <option>Education</option>
                <option>Healthcare</option>
                <option>Manufacturing</option>
                <option>Retail / E-commerce</option>
                <option>Other</option>
              </Select>
              <Select
                label="Company size"
                value={hiring.size}
                onChange={(e) => setHiring((s) => ({ ...s, size: e.target.value }))}
              >
                <option>1-10</option>
                <option>11-50</option>
                <option>51-200</option>
                <option>200+</option>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Your designation"
                value={hiring.designation}
                onChange={(e) => setHiring((s) => ({ ...s, designation: e.target.value }))}
              >
                <option>Recruiter</option>
                <option>HR Manager</option>
                <option>Team Lead</option>
                <option>Founder</option>
              </Select>
              <Input
                label="Departments you hire for"
                placeholder="e.g. Engineering, Design"
                value={hiring.departments}
                maxLength={200}
                hint="Comma separated."
                onChange={(e) => setHiring((s) => ({ ...s, departments: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="label-base mb-0">Apply threshold</label>
                  <span className="text-sm font-bold text-brand-600">{hiring.applyThreshold}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={hiring.applyThreshold}
                  onChange={(e) => setHiring((s) => ({ ...s, applyThreshold: +e.target.value }))}
                  className="w-full accent-brand-600"
                />
                <p className="mt-1 text-xs text-ink-400">Below this CV match, candidates can&apos;t apply.</p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="label-base mb-0">Pass threshold</label>
                  <span className="text-sm font-bold text-brand-600">{hiring.passThreshold}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={hiring.passThreshold}
                  onChange={(e) => setHiring((s) => ({ ...s, passThreshold: +e.target.value }))}
                  className="w-full accent-brand-600"
                />
                <p className="mt-1 text-xs text-ink-400">At or above this, a candidate is marked passed.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Default interview language"
                value={hiring.language}
                onChange={(e) => setHiring((s) => ({ ...s, language: e.target.value }))}
              >
                {/* "Both" here means an English/Roman-Urdu mix during the
                    interview — a different thing from the interface preference
                    below, which uses the same word for which language the UI
                    is shown in. */}
                <option>English</option>
                <option>Roman Urdu</option>
                <option>Both</option>
                <option>Urdu</option>
              </Select>
              <Select
                label="Questions per interview"
                value={hiring.questionsPerInterview}
                onChange={(e) => setHiring((s) => ({ ...s, questionsPerInterview: +e.target.value }))}
              >
                <option>5</option>
                <option>8</option>
                <option>10</option>
              </Select>
            </div>

            <Button size="sm" onClick={saveHiring} disabled={savingHiring}>
              {savingHiring ? <><Spinner size={16} /> Saving…</> : 'Save hiring defaults'}
            </Button>
          </CardBody>
        </Card>
      )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
      {/* Preferences */}
      <Card>
        <CardHeader title="Preferences" subtitle="Saved automatically" />
        <CardBody className="divide-y divide-ink-100 py-0">
          <Row icon={Globe} title="Language" desc="Interface & interview language">
            <Select
              className="w-36"
              value={settings.language || 'Both'}
              onChange={(e) => savePref({ language: e.target.value })}
              disabled={savingPref}
            >
              <option>English</option><option>Urdu</option><option>Both</option>
            </Select>
          </Row>
          <Row icon={Bell} title="Email notifications" desc="Results, shortlists, new jobs">
            <Toggle
              on={settings.emailNotifications !== false}
              disabled={savingPref}
              onClick={() => savePref({ emailNotifications: !(settings.emailNotifications !== false) })}
            />
          </Row>
          <Row icon={Bell} title="Push notifications" desc="Browser alerts">
            <Toggle
              on={Boolean(settings.pushNotifications)}
              disabled={savingPref}
              onClick={() => savePref({ pushNotifications: !settings.pushNotifications })}
            />
          </Row>
        </CardBody>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader title="Security" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Current password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              label="New password"
              type="password"
              placeholder="Min 8 characters"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={changePassword} disabled={savingPassword}>
            {savingPassword ? <><Spinner size={16} /> Updating…</> : <><Lock className="h-3.5 w-3.5" /> Update password</>}
          </Button>
        </CardBody>
      </Card>

      {/* Privacy & consent */}
      <Card>
        <CardHeader title="Privacy & consent" subtitle="Face & voice verification" />
        <CardBody className="divide-y divide-ink-100 py-0">
          <Row icon={Shield} title="Allow face & voice processing" desc="Required for interview verification">
            <Toggle
              on={settings.faceVoiceConsent !== false}
              disabled={savingPref}
              onClick={() => savePref({ faceVoiceConsent: !(settings.faceVoiceConsent !== false) })}
            />
          </Row>
          <Row icon={User} title="Download my data" desc="Export your account, applications and interviews as JSON">
            <Button variant="ghost" size="sm" onClick={exportData} disabled={exporting}>
              {exporting ? <Spinner size={16} /> : <><Download className="h-3.5 w-3.5" /> Export</>}
            </Button>
          </Row>
        </CardBody>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader title="Danger zone" />
        <CardBody>
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink-900">Delete account</div>
                <div className="text-xs text-ink-500">
                  {isHr
                    ? 'Removes your account, your job postings and all their applications.'
                    : 'Removes your account, your applications and your interview reports.'}
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-red-700">
                This cannot be undone. Enter your password to confirm.
              </p>
              <Input
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setConfirmDelete(false); setDeletePassword('') }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={deleteAccount} disabled={deleting}>
                  {deleting ? <><Spinner size={16} /> Deleting…</> : 'Permanently delete my account'}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* HR-only hint so company setup is never a dead end */}
      {isHr && !user.company && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
          Set your company above — team members and invites are grouped by company.
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
