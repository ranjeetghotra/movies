import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { AuthService } from '../auth.service';
import { SocialAuthService } from '../social-auth.service';
import { CurrentUser } from '../current-user';
import { ActivatedRoute, Router } from '@angular/router';
import { Settings } from '../../core/config/settings.service';
import { Toast } from '../../core/ui/toast.service';
import { Bootstrapper } from '../../core/bootstrapper.service';
import { RecaptchaService } from '../../core/services/recaptcha.service';
import { FormBuilder, FormControl } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { MenuItem } from '@common/core/ui/custom-menu/menu-item';
import { slugifyString } from '@common/core/utils/slugify-string';
import { BackendErrorResponse } from '@common/core/types/backend-error-response';
import { filter } from 'rxjs/operators';

@Component({
    selector: 'register',
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent implements OnInit {
    public loading$ = new BehaviorSubject<boolean>(false);
    public registerPolicies: Partial<MenuItem>[] = [];
    public form = this.fb.group({
        email: [''],
        subdomain: [''],
        password: [''],
        password_confirmation: [''],
        purchase_code: [''],
        wp: [''],
    });
    public errors$ = new BehaviorSubject<{
        email?: string,
        subdomain?: string,
        password?: string,
        general?: string,
        purchase_code?: string,
        wp?: string,
    }>({});

    constructor(
        public auth: AuthService,
        public socialAuth: SocialAuthService,
        public settings: Settings,
        public route: ActivatedRoute,
        private user: CurrentUser,
        private router: Router,
        private toast: Toast,
        private bootstrapper: Bootstrapper,
        private recaptcha: RecaptchaService,
        private fb: FormBuilder,
    ) { }

    ngOnInit() {
        this.registerPolicies = this.settings.getJson('register_policies', []);
        this.registerPolicies.forEach(policy => {
            policy.id = slugifyString(policy.label, '_');
            this.form.addControl(policy.id, new FormControl(false));
        });
        if (this.recaptcha.enabledFor('registration')) {
            this.recaptcha.load();
        }
        this.auth.forcedEmail$
            .pipe(filter(email => !!email))
            .subscribe(email => {
                this.form.get('email').setValue(email);
                this.form.get('email').disable();
            });
        this.route.queryParams
            .subscribe(params => {
                if (params.wp) {
                    this.form.patchValue({ wp: params.wp || '' });
                } else {
                    this.router.navigate(['/404']);
                }
            }
            );
    }

    onSubdomainInput(event: any) {
        const input = event.target as HTMLInputElement;
        const filteredValue = input.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
        if (filteredValue === 'www') {
            input.value = '';
        } else {
            input.value = filteredValue;
        }
    }

    public async register() {
        this.loading$.next(true);
        if (this.recaptcha.enabledFor('registration') && ! await this.recaptcha.verify('registration')) {
            this.loading$.next(false);
            return this.toast.open('Could not verify you are human.');
        }

        this.auth.register(this.form.getRawValue())
            .subscribe(response => {
                if (response.status === 'needs_email_verification') {
                    const currentDomain = window.location.hostname;
                    const newUrl = `https://${this.form.value.subdomain}.${currentDomain}`;
                    this.router.navigate(['/admin/analytics/google']).then(() => {
                        this.loading$.next(false);
                        this.toast.open(response.message, { duration: 12000 });
                        window.location.href = newUrl
                    });
                } else {
                    this.bootstrapper.bootstrap(response.bootstrapData);
                    this.router.navigate([this.auth.getRedirectUri()]).then(() => {
                        this.loading$.next(false);
                        this.toast.open('Registered successfully.');
                    });
                }
            }, (errResponse: BackendErrorResponse) => {
                this.errors$.next(errResponse.errors);
                this.loading$.next(false);
            });
    }
}
