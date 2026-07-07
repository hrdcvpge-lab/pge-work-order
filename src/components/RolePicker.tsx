import type { TeamMember } from '../types/workOrder'
import { roleLabels } from '../utils/workOrder'
import { Icon } from './Icon'

interface RolePickerProps {
  teamMembers: TeamMember[]
  currentUser: TeamMember
  onChange: (member: TeamMember) => void
}

export function RolePicker({ teamMembers, currentUser, onChange }: RolePickerProps) {
  return (
    <label className="user-switcher">
      <span className="user-switcher__icon"><Icon name="user" /></span>
      <span className="user-switcher__copy">
        <small>Mode tampilan</small>
        <strong>{roleLabels[currentUser.role]}</strong>
      </span>
      <select
        value={currentUser.id}
        onChange={(event) => {
          const selected = teamMembers.find((member) => member.id === event.target.value)
          if (selected) onChange(selected)
        }}
        aria-label="Pilih peran pengguna"
      >
        {teamMembers.map((member) => (
          <option key={member.id} value={member.id}>{member.name}</option>
        ))}
      </select>
      <Icon name="chevron" className="user-switcher__chevron" />
    </label>
  )
}
