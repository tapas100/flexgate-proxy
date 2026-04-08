pipeline {
    agent any

    // ── NodeJS Plugin: installs Node and puts node/npm on PATH ───────────────
    // Prerequisite: Jenkins → Manage Jenkins → Tools → NodeJS installations
    //   Add an installation named exactly "NodeJS 20" with version 20.x
    tools {
        nodejs 'NodeJS 20'
    }

    environment {
        NODE_VERSION   = '20'
        NPM_TOKEN      = credentials('registry-token')     // npm auth token stored in Jenkins credentials
        CI             = 'true'
    }

    // Trigger on push to main OR merge (PR close) into main
    triggers {
        githubPush()
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // ── 1. Checkout ──────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                sh 'echo "Branch: ${GIT_BRANCH} | Commit: ${GIT_COMMIT}"'
            }
        }

        // ── 2. Verify Node ───────────────────────────────────────────────────
        // Installs libatomic if missing — required by Node 20+ on Alpine/Debian-slim
        stage('Setup Node.js') {
            steps {
                sh '''
                    # Install libatomic if not present (needed by Node 20+ on minimal Linux images)
                    if ! ldconfig -p 2>/dev/null | grep -q libatomic; then
                        if command -v apt-get >/dev/null 2>&1; then
                            apt-get update -qq && apt-get install -y -qq libatomic1
                        elif command -v apk >/dev/null 2>&1; then
                            apk add --no-cache libatomic
                        elif command -v yum >/dev/null 2>&1; then
                            yum install -y libatomic
                        fi
                    fi
                    echo "Node: $(node --version)"
                    echo "npm:  $(npm --version)"
                '''
            }
        }

        // ── 3. Install dependencies ──────────────────────────────────────────
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        // ── 4. Lint ──────────────────────────────────────────────────────────
        stage('Lint') {
            steps {
                sh 'npm run lint || echo "[WARN] Lint issues found — continuing"'
            }
        }

        // ── 5. Type-check ────────────────────────────────────────────────────
        stage('Type Check') {
            steps {
                sh 'npm run typecheck'
            }
        }

        // ── 6. Test ──────────────────────────────────────────────────────────
        stage('Test') {
            environment {
                NODE_ENV    = 'test'
                DATABASE_URL = 'postgresql://flexgate:flexgate@localhost:5432/flexgate_test'
            }
            steps {
                sh 'npm run test:ci'
            }
            post {
                always {
                    // Publish JUnit test results if jest-junit reporter is configured
                    junit allowEmptyResults: true, testResults: 'test-results/**/*.xml'
                    // Publish coverage report
                    publishHTML(target: [
                        allowMissing         : true,
                        alwaysLinkToLastBuild: true,
                        keepAll              : true,
                        reportDir            : 'coverage/lcov-report',
                        reportFiles          : 'index.html',
                        reportName           : 'Coverage Report'
                    ])
                }
            }
        }

        // ── 7. Build TypeScript ──────────────────────────────────────────────
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        // ── 8. Build Admin UI ────────────────────────────────────────────────
        stage('Build Admin UI') {
            steps {
                dir('admin-ui') {
                    sh 'npm ci'
                    sh 'npm run build'
                }
            }
        }

        // ── 9. Publish to npm (main branch only) ─────────────────────────────
        //
        //  Rules:
        //    • Only runs on the main branch (push or merged PR).
        //    • Reads the version from package.json — YOU control what gets
        //      published by bumping the version in package.json before merging.
        //    • Guard: if this exact version is already on npm the stage is
        //      skipped (not failed) so repeated pushes to main are safe.
        //    • Always tags the published version as `latest`.
        //    • Requires Jenkins credential  id = 'NPM_TOKEN'  (Secret text).
        // ─────────────────────────────────────────────────────────────────────
        stage('Publish to npm') {
            when {
                anyOf {
                    branch 'main'
                    expression { env.GIT_BRANCH == 'origin/main' }
                }
            }
            steps {
                script {
                    // ── Auth ──────────────────────────────────────────────────
                    sh 'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc'
                    sh 'chmod 600 ~/.npmrc'

                    // ── Read version from package.json ────────────────────────
                    def pkgVersion = sh(
                        script: "node -p \"require('./package.json').version\"",
                        returnStdout: true
                    ).trim()

                    echo "Package version: flexgate-proxy@${pkgVersion}"

                    // ── Guard: skip if already published ──────────────────────
                    def alreadyPublished = sh(
                        script: "npm view flexgate-proxy@${pkgVersion} version 2>/dev/null || true",
                        returnStdout: true
                    ).trim()

                    if (alreadyPublished == pkgVersion) {
                        echo "⚠️  flexgate-proxy@${pkgVersion} is already on npm — skipping publish."
                    } else {
                        // ── Publish ───────────────────────────────────────────
                        echo "🚀 Publishing flexgate-proxy@${pkgVersion} to npm..."
                        sh "npm publish --access public"

                        // ── Tag as latest ─────────────────────────────────────
                        sh "npm dist-tag add flexgate-proxy@${pkgVersion} latest"

                        echo "✅ Published and tagged flexgate-proxy@${pkgVersion} as latest."
                    }
                }
            }
            post {
                always {
                    // Always clean the .npmrc so the token is never left on disk
                    sh 'rm -f ~/.npmrc'
                }
            }
        }
    }

    // ── Post-build ────────────────────────────────────────────────────────────
    post {
        success {
            echo '✅ Pipeline succeeded.'
        }
        failure {
            echo '❌ Pipeline failed. Check the logs above.'
        }
        always {
            // Clean workspace to save disk space
            cleanWs()
        }
    }
}
