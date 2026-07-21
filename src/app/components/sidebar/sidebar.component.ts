import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Fixed application sidebar: brand, navigation, and a projected slot at the
 * bottom (used for the organization switcher). Off-canvas on small screens,
 * controlled by `mobileOpen`.
 */
@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  groupCount = input(0);
  mobileOpen = input(false);
}
