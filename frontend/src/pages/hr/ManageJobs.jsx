import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Users, MapPin, Trash2, Circle, FolderKanban, Pencil, MessageSquare, Wallet, CalendarDays, Eye } from 'lucide-react'
import { Card, CardBody } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useToast } from '../../context/ToastContext'
import { formatSalary, formatDeadline, isDeadlineSoon } from '../../lib/job'

const statusTone = { open: 'green', closed: 'gray', draft: 'amber' }

export default function ManageJobs() {
  const toast = useToast()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch(() => api.get('/jobs/mine'), [])
  const jobs = data?.jobs || []
  const [deletingId, setDeletingId] = useState(null)

  const remove = async (job) => {
    if (!confirm(`Delete "${job.title}" and all its applications?`)) return
    setDeletingId(job._id)
    try {
      await api.del(`/jobs/${job._id}`)
      toast.success('Job deleted')
      reload()
    } catch (err) {
      toast.error(err.message || 'Could not delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Manage Jobs</h2>
          <p className="text-sm text-ink-500">Your posted positions</p>
        </div>
        <Button as={Link} to="/hr/post-job"><Plus className="h-4 w-4" /> Post job</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-brand-600"><Spinner size={26} /></div>
      ) : error ? (
        <EmptyState title="Couldn't load jobs" description={error} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No jobs posted yet"
          description="Post your first role and start receiving AI-screened candidates."
          action={<Button as={Link} to="/hr/post-job"><Plus className="h-4 w-4" /> Post a job</Button>}
        />
      ) : (
        <div className="grid gap-4">
          {jobs.map((j) => (
            <Card key={j._id}>
              <CardBody>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-ink-900">{j.title}</h3>
                      <Badge tone={j.isExpired ? 'red' : statusTone[j.status] || 'gray'}>
                        <Circle className="h-2 w-2 fill-current" /> {j.isExpired ? 'expired' : j.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location}</span>
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{j.applicantsCount} applicants</span>
                      <span>Apply ≥ {j.applyThreshold}% · Pass ≥ {j.passThreshold}%</span>
                      {formatSalary(j) && (
                        <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />{formatSalary(j)}</span>
                      )}
                      {j.openings > 1 && <span>{j.openings} openings</span>}
                      {formatDeadline(j.deadline) && (
                        <span className={
                          'flex items-center gap-1 ' +
                          (j.isExpired ? 'text-red-600' : isDeadlineSoon(j.deadline) ? 'text-amber-700' : '')
                        }>
                          <CalendarDays className="h-3.5 w-3.5" />{formatDeadline(j.deadline)}
                        </span>
                      )}
                      {j.customQuestions?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {j.customQuestions.length} of your questions
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button onClick={() => navigate(`/hr/applications?job=${j._id}`)} variant="secondary" size="sm" className="whitespace-nowrap">
                      <Eye className="h-3.5 w-3.5" /> View applicants
                    </Button>
                    <Button as={Link} to={`/hr/jobs/${j._id}/edit`} variant="secondary" size="sm" className="whitespace-nowrap">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <button
                      onClick={() => remove(j)}
                      disabled={deletingId === j._id}
                      className="rounded-lg p-2 text-ink-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Delete job"
                    >
                      {deletingId === j._id ? <Spinner size={16} /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
